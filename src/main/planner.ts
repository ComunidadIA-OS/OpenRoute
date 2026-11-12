// Orquesta un plan: geocodifica lo que falte, pide la matriz de viaje,
// resuelve, mide contra el plan manual y trae los trazados por calles.

import { manualBaseline } from '../core/baseline'
import { solve, evaluateAssignment, totalsOf } from '../core/solver'
import type { LatLng, LocatedOrder, Plan, TravelMatrix } from '../core/types'
import { setBusy } from './runtime'
import { geocode } from './services/geocode'
import { routeGeometry, travelMatrix } from './services/routing'
import { newId, store, type Session } from './store'

const matrixCache = new Map<string, { key: string; matrix: TravelMatrix }>()

const pointsKey = (pts: LatLng[]): string => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')

/** Busca coordenadas para los pedidos que no las tienen. Devuelve los que no se encontraron. */
export async function locateOrders(session: Session): Promise<string[]> {
  const missing = session.orders.filter((o) => o.lat === undefined || o.lng === undefined)
  const notFound: string[] = []
  const { countryCodes } = store.state.settings
  const near = store.state.depot ?? undefined
  for (let k = 0; k < missing.length; k++) {
    const o = missing[k]
    setBusy({ stage: 'geocoding', label: `Buscando direcciones`, done: k, total: missing.length })
    const hit = await geocode(o.address, countryCodes, near)
    if (hit) {
      store.mutate(() => {
        o.lat = hit.lat
        o.lng = hit.lng
      })
    } else {
      notFound.push(o.id)
    }
  }
  if (missing.length) setBusy(null)
  return notFound
}

async function matrixFor(session: Session, points: LatLng[]): Promise<TravelMatrix> {
  const key = `${store.state.settings.osrmUrl}|${pointsKey(points)}`
  const hit = matrixCache.get(session.id)
  if (hit && hit.key === key) return hit.matrix
  const matrix = await travelMatrix(store.state.settings.osrmUrl, points)
  matrixCache.set(session.id, { key, matrix })
  return matrix
}

function located(session: Session): LocatedOrder[] {
  return session.orders.filter((o): o is LocatedOrder => o.lat !== undefined && o.lng !== undefined)
}

async function attachGeometry(plan: Plan, orders: LocatedOrder[]): Promise<void> {
  const depot = store.state.depot!
  const byId = new Map(orders.map((o) => [o.id, o]))
  const used = plan.routes.filter((r) => r.stops.length > 0)
  setBusy({ stage: 'geometry', label: 'Dibujando las rutas por calles', done: 0, total: used.length })
  let done = 0
  await Promise.all(
    used.map(async (r) => {
      const path = [depot, ...r.stops.map((s) => byId.get(s.orderId)!), depot]
      r.geometry = await routeGeometry(store.state.settings.osrmUrl, path)
      setBusy({ stage: 'geometry', label: 'Dibujando las rutas por calles', done: ++done, total: used.length })
    })
  )
}

export async function planSession(session: Session): Promise<Plan> {
  const depot = store.state.depot
  if (!depot) throw new Error('Falta el depósito. Añádelo en Flota.')
  const vehicles = store.state.vehicles.filter((v) => v.available)
  if (vehicles.length === 0) throw new Error('No hay vehículos disponibles. Revisa la flota.')
  if (session.orders.length === 0) throw new Error('No hay pedidos. Importa un CSV o carga el ejemplo.')

  try {
    const notFound = await locateOrders(session)
    const orders = located(session)
    if (orders.length === 0) throw new Error('No se ha podido ubicar ningún pedido en el mapa.')

    setBusy({ stage: 'matrix', label: 'Calculando distancias por calles' })
    const matrix = await matrixFor(session, [depot, ...orders])

    setBusy({ stage: 'solving', label: `Optimizando ${orders.length} pedidos en ${vehicles.length} vehículos` })
    const serviceMin = store.state.settings.serviceMin
    const input = { depot, vehicles, orders, matrix, serviceMin }
    // Tope de seguridad: con muchos pedidos el motor para aquí aunque le queden vueltas.
    const timeLimitMs = 20_000
    // Cede el hilo para que la interfaz pinte el estado antes de calcular.
    await new Promise((r) => setTimeout(r, 30))
    const result = solve({ ...input, timeLimitMs })
    const baseline = manualBaseline(input)

    const plan: Plan = {
      id: newId('p_'),
      createdAt: new Date().toISOString(),
      status: 'draft',
      routes: result.routes,
      unassigned: [
        ...result.unassigned,
        ...notFound.map((orderId) => ({ orderId, reason: 'No se ha encontrado la dirección en el mapa.' }))
      ],
      totals: result.totals,
      baseline,
      matrixSource: matrix.source,
      solveMs: result.solveMs,
      serviceMin
    }
    await attachGeometry(plan, orders)
    store.mutate(() => {
      session.plan = plan
      store.touch(session)
    })
    return plan
  } finally {
    setBusy(null)
  }
}

/** Mueve un pedido a otro vehículo (o de posición) y recalcula sin rechazar nada. */
export async function moveOrder(
  session: Session,
  orderId: string,
  vehicleId: string,
  position?: number
): Promise<{ warnings: string[] }> {
  const plan = session.plan
  const depot = store.state.depot
  if (!plan || !depot) throw new Error('Primero calcula un plan.')
  if (plan.status === 'approved') throw new Error('El plan está aprobado. Reábrelo para cambiarlo.')
  const vehicles = store.state.vehicles.filter((v) => v.available || plan.routes.some((r) => r.vehicleId === v.id))
  if (!vehicles.some((v) => v.id === vehicleId)) throw new Error(`No existe el vehículo ${vehicleId}.`)
  const orders = located(session)
  if (!orders.some((o) => o.id === orderId)) throw new Error(`No existe el pedido ${orderId} o no tiene ubicación.`)

  const assignment: Record<string, string[]> = {}
  for (const v of vehicles) {
    assignment[v.id] = (plan.routes.find((r) => r.vehicleId === v.id)?.stops ?? [])
      .map((s) => s.orderId)
      .filter((id) => id !== orderId)
  }
  const target = assignment[vehicleId]
  const at = position === undefined ? target.length : Math.max(0, Math.min(target.length, position))
  target.splice(at, 0, orderId)

  const matrix = await matrixFor(session, [depot, ...orders])
  const routes = evaluateAssignment({ depot, vehicles, orders, matrix, serviceMin: plan.serviceMin }, assignment)
  const prevGeometry = new Map(plan.routes.map((r) => [r.vehicleId, r]))
  const changed = new Set([
    vehicleId,
    ...plan.routes.filter((r) => r.stops.some((s) => s.orderId === orderId)).map((r) => r.vehicleId)
  ])
  for (const r of routes) {
    if (!changed.has(r.vehicleId)) r.geometry = prevGeometry.get(r.vehicleId)?.geometry
  }
  const next: Plan = {
    ...plan,
    routes,
    unassigned: plan.unassigned.filter((u) => u.orderId !== orderId),
    totals: totalsOf(routes)
  }
  await attachGeometry({ ...next, routes: routes.filter((r) => changed.has(r.vehicleId)) }, orders)
  setBusy(null)
  store.mutate(() => {
    session.plan = next
    store.touch(session)
  })
  const route = routes.find((r) => r.vehicleId === vehicleId)!
  const warnings: string[] = []
  if (route.overloaded) warnings.push(`${vehicleId} va sobrecargado (${route.loadKg.toFixed(0)} kg).`)
  if (route.lateStops > 0) warnings.push(`${vehicleId} llegaría tarde a ${route.lateStops} parada(s).`)
  return { warnings }
}

/** Invalida el plan cuando cambian los pedidos o la flota. */
export function invalidatePlan(session: Session): void {
  if (session.plan && session.plan.status !== 'approved') session.plan = null
}
