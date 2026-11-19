// Orquesta un plan: geocodifica lo que falte, pide la matriz de viaje,
// resuelve, mide contra el plan manual y trae los trazados por calles.

import { ui } from './ui-language'
import { manualBaseline } from '../core/baseline'
import { solve, evaluateAssignment, totalsOf } from '../core/solver'
import type { LatLng, LocatedOrder, Plan, TravelMatrix } from '../core/types'
import { setBusy } from './runtime'
import { geocode } from './services/geocode'
import { routeGeometry, travelMatrix } from './services/routing'
import { newId, store, type Session } from './store'

const matrixCache = new Map<string, { key: string; matrix: TravelMatrix }>()

function planInputsKey(session: Session): string {
  const { depot, vehicles, settings } = store.state
  return JSON.stringify([session.orders, depot, vehicles, settings.osrmUrl, settings.serviceMin])
}

function ensurePlanInputs(session: Session, key: string, previousPlan: Plan | null): void {
  if (store.session(session.id) !== session || planInputsKey(session) !== key || session.plan !== previousPlan) {
    throw new Error(
      ui(
        'El reparto cambió durante el cálculo. Vuelve a calcular las rutas.',
        'The delivery run changed during planning. Recalculate the routes.'
      )
    )
  }
}

const pointsKey = (pts: LatLng[]): string => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')

/** Busca coordenadas para los pedidos que no las tienen. Devuelve los que no se encontraron. */
export async function locateOrders(session: Session): Promise<string[]> {
  const missing = session.orders.filter((o) => o.lat === undefined || o.lng === undefined)
  const notFound: string[] = []
  const { countryCodes } = store.state.settings
  const near = store.state.depot ?? undefined
  for (let k = 0; k < missing.length; k++) {
    const o = missing[k]
    setBusy({
      stage: 'geocoding',
      label: ui(`Buscando direcciones`, `Looking up addresses`),
      done: k,
      total: missing.length
    })
    const address = o.address
    const hit = await geocode(address, countryCodes, near)
    if (o.address !== address || !session.orders.includes(o) || store.session(session.id) !== session) {
      throw new Error(
        ui(
          'Los pedidos cambiaron mientras se buscaban direcciones. Vuelve a calcular las rutas.',
          'Orders changed during address lookup. Recalculate the routes.'
        )
      )
    }
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
  setBusy({
    stage: 'geometry',
    label: ui('Dibujando las rutas por calles', 'Drawing routes along roads'),
    done: 0,
    total: used.length
  })
  let done = 0
  await Promise.all(
    used.map(async (r) => {
      const path = [depot, ...r.stops.map((s) => byId.get(s.orderId)!), depot]
      r.geometry = await routeGeometry(store.state.settings.osrmUrl, path)
      setBusy({
        stage: 'geometry',
        label: ui('Dibujando las rutas por calles', 'Drawing routes along roads'),
        done: ++done,
        total: used.length
      })
    })
  )
}

export async function planSession(session: Session): Promise<Plan> {
  const depot = store.state.depot
  if (!depot) throw new Error(ui('Falta el depósito. Añádelo en Flota.', 'Add a depot in Fleet before planning.'))
  const vehicles = store.state.vehicles.filter((v) => v.available)
  if (vehicles.length === 0)
    throw new Error(
      ui('No hay vehículos disponibles. Revisa la flota.', 'No vehicles are available. Check your fleet.')
    )
  if (session.orders.length === 0)
    throw new Error(ui('No hay pedidos. Añádelos en Pedidos.', 'There are no orders. Add them in Orders.'))

  try {
    const previousPlan = session.plan
    const notFound = await locateOrders(session)
    const orders = located(session)
    const inputsKey = planInputsKey(session)
    if (
      depot !== store.state.depot ||
      vehicles.some((v) => !store.state.vehicles.includes(v)) ||
      vehicles.length !== store.state.vehicles.filter((v) => v.available).length
    ) {
      throw new Error(
        ui(
          'La flota cambió durante el cálculo. Vuelve a calcular las rutas.',
          'The fleet changed during planning. Recalculate the routes.'
        )
      )
    }
    if (orders.length === 0)
      throw new Error(
        ui('No se ha podido ubicar ningún pedido en el mapa.', 'None of the orders could be located on the map.')
      )

    setBusy({ stage: 'matrix', label: ui('Calculando distancias por calles', 'Calculating road distances') })
    const matrix = await matrixFor(session, [depot, ...orders])

    setBusy({
      stage: 'solving',
      label: ui(
        `Optimizando ${orders.length} pedidos en ${vehicles.length} vehículos`,
        `Optimizing ${orders.length} orders across ${vehicles.length} vehicles`
      )
    })
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
    ensurePlanInputs(session, inputsKey, previousPlan)
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
  if (!plan || !depot) throw new Error(ui('Primero calcula un plan.', 'Calculate a plan first.'))
  if (plan.status === 'approved')
    throw new Error(ui('El plan está aprobado. Reábrelo para cambiarlo.', 'Reopen the approved plan to edit it.'))
  const vehicles = store.state.vehicles.filter((v) => v.available || plan.routes.some((r) => r.vehicleId === v.id))
  if (!vehicles.some((v) => v.id === vehicleId))
    throw new Error(ui(`No existe el vehículo ${vehicleId}.`, `Vehicle ${vehicleId} does not exist.`))
  const orders = located(session)
  if (!orders.some((o) => o.id === orderId))
    throw new Error(
      ui(`No existe el pedido ${orderId} o no tiene ubicación.`, `Order ${orderId} is missing or has no location.`)
    )

  const assignment: Record<string, string[]> = {}
  for (const v of vehicles) {
    assignment[v.id] = (plan.routes.find((r) => r.vehicleId === v.id)?.stops ?? [])
      .map((s) => s.orderId)
      .filter((id) => id !== orderId)
  }
  const target = assignment[vehicleId]
  const at = position === undefined ? target.length : Math.max(0, Math.min(target.length, position))
  target.splice(at, 0, orderId)

  const inputsKey = planInputsKey(session)
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
  ensurePlanInputs(session, inputsKey, plan)
  if (plan.status !== 'draft')
    throw new Error(ui('El plan está aprobado. Reábrelo para cambiarlo.', 'Reopen the approved plan to edit it.'))
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
  session.plan = null
}
