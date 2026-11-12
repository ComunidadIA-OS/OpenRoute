// Motor de rutas: problema de rutas de vehículos con capacidades y ventanas
// horarias (CVRPTW) y pedidos que pueden quedar fuera si no caben.
//
// 1. Construcción por inserción con arrepentimiento (regret-2): primero los
//    pedidos de prioridad alta y, dentro de cada prioridad, los que más se
//    perderían si no se colocan ya en su mejor sitio.
// 2. Búsqueda local: 2-opt dentro de cada ruta, mover un pedido a otra
//    posición o ruta, e intercambiar pedidos entre rutas.
// 3. Destrucción y reconstrucción (LNS) hasta agotar el tiempo: se quitan
//    pedidos cercanos entre sí y se vuelven a insertar.
//
// Es determinista: con la misma entrada y la misma semilla da el mismo plan.

import { toMinutes } from './time'
import type { Depot, LocatedOrder, PlanTotals, Route, Stop, TravelMatrix, Unassigned, Vehicle } from './types'

/** Gramos de CO₂ por km. Estimación media de una furgoneta de reparto. */
export const CO2_G_PER_KM = { diesel: 250, electric: 40 }
export const DEFAULT_SERVICE_MIN = 8

export interface SolveInput {
  depot: Depot
  vehicles: Vehicle[]
  orders: LocatedOrder[]
  matrix: TravelMatrix
  serviceMin?: number
  /** Tope de seguridad. El resultado no depende de él salvo que se alcance. */
  timeLimitMs?: number
  /** Vueltas de destrucción y reconstrucción. Por defecto, según el tamaño. */
  iterations?: number
  /** Arranques independientes; las vueltas se reparten entre ellos. */
  restarts?: number
  seed?: number
}

export interface SolveResult {
  routes: Route[]
  unassigned: Unassigned[]
  totals: PlanTotals
  solveMs: number
  /** Vueltas hechas. Si es menor que las pedidas, se alcanzó el tope de tiempo. */
  iterations: number
}

export const DEFAULT_RESTARTS = 16

/** Vueltas por defecto: más pedidos, más vueltas, con un máximo. */
export function defaultIterations(orders: number): number {
  return Math.min(4000, Math.max(1600, orders * 100))
}

interface Ctx {
  vehicles: Vehicle[]
  orders: LocatedOrder[]
  dist: number[][]
  dur: number[][]
  wStart: number[]
  wEnd: number[]
  service: number[]
  weight: number[]
  vStart: number[]
  vEnd: number[]
}

export interface Simulation {
  feasible: boolean
  distanceM: number
  leaveMin: number
  returnMin: number
  loadKg: number
  lateStops: number
  lateMin: number
  stops: Stop[]
}

function buildCtx(input: SolveInput): Ctx {
  const serviceMin = input.serviceMin ?? DEFAULT_SERVICE_MIN
  const n = input.orders.length + 1
  if (input.matrix.distanceM.length !== n || input.matrix.durationS.length !== n) {
    throw new Error(`La matriz debe ser de ${n}×${n} (depósito + ${n - 1} pedidos).`)
  }
  return {
    vehicles: input.vehicles,
    orders: input.orders,
    dist: input.matrix.distanceM,
    dur: input.matrix.durationS.map((row) => row.map((s) => s / 60)),
    wStart: input.orders.map((o) => toMinutes(o.windowStart)),
    wEnd: input.orders.map((o) => toMinutes(o.windowEnd)),
    service: input.orders.map((o) => o.serviceMin ?? serviceMin),
    weight: input.orders.map((o) => o.weightKg),
    vStart: input.vehicles.map((v) => toMinutes(v.start)),
    vEnd: input.vehicles.map((v) => toMinutes(v.end))
  }
}

/**
 * Recorre una ruta y calcula horas, carga y retrasos. `feasible` indica si
 * cumple todas las restricciones duras (capacidad, ventanas y jornada).
 */
function simulate(ctx: Ctx, v: number, seq: number[], withStops = false): Simulation {
  const stops: Stop[] = []
  if (seq.length === 0) {
    return {
      feasible: true,
      distanceM: 0,
      leaveMin: ctx.vStart[v],
      returnMin: ctx.vStart[v],
      loadKg: 0,
      lateStops: 0,
      lateMin: 0,
      stops
    }
  }
  const first = seq[0]
  // Sale del depósito lo justo para llegar cuando abre la primera ventana.
  const leave = Math.max(ctx.vStart[v], ctx.wStart[first] - ctx.dur[0][first + 1])
  let t = leave
  let prev = 0
  let distanceM = 0
  let load = 0
  let lateStops = 0
  let lateMin = 0
  for (const i of seq) {
    const node = i + 1
    t += ctx.dur[prev][node]
    distanceM += ctx.dist[prev][node]
    const arrival = t
    const wait = Math.max(0, ctx.wStart[i] - t)
    t += wait
    const late = t - ctx.wEnd[i]
    if (late > 1e-9) {
      lateStops++
      lateMin += late
    }
    t += ctx.service[i]
    load += ctx.weight[i]
    if (withStops) {
      stops.push({
        orderId: ctx.orders[i].id,
        arrival,
        waitMin: wait,
        departure: t,
        late: late > 1e-9,
        lateMin: Math.max(0, late)
      })
    }
    prev = node
  }
  t += ctx.dur[prev][0]
  distanceM += ctx.dist[prev][0]
  const feasible = lateStops === 0 && load <= ctx.vehicles[v].capacityKg + 1e-9 && t <= ctx.vEnd[v] + 1e-9
  return { feasible, distanceM, leaveMin: leave, returnMin: t, loadKg: load, lateStops, lateMin, stops }
}

/** Coste que minimiza el motor: euros por km y una pizca de tiempo para desempatar. */
function objective(ctx: Ctx, v: number, sim: Simulation): number {
  if (sim.distanceM === 0) return 0
  const perKm = Math.max(ctx.vehicles[v].costPerKm, 0.01)
  return (sim.distanceM / 1000) * perKm + (sim.returnMin - sim.leaveMin) * 0.001
}

function routeCost(ctx: Ctx, v: number, seq: number[]): number {
  const sim = simulate(ctx, v, seq)
  return sim.feasible ? objective(ctx, v, sim) : Infinity
}

/** Penalización por dejar un pedido fuera; los urgentes pesan más. */
function dropPenalty(ctx: Ctx, i: number): number {
  return 1000 * ctx.orders[i].priority
}

// Generador pseudoaleatorio con semilla (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface State {
  routes: number[][]
  costs: number[]
  unrouted: Set<number>
}

function totalCost(ctx: Ctx, s: State): number {
  let c = 0
  for (const x of s.costs) c += x
  for (const i of s.unrouted) c += dropPenalty(ctx, i)
  return c
}

function clone(s: State): State {
  return { routes: s.routes.map((r) => [...r]), costs: [...s.costs], unrouted: new Set(s.unrouted) }
}

interface Insertion {
  delta: number
  route: number
  pos: number
}

function bestInsertionInRoute(ctx: Ctx, s: State, i: number, r: number): Insertion | null {
  const seq = s.routes[r]
  let best: Insertion | null = null
  for (let pos = 0; pos <= seq.length; pos++) {
    const cand = [...seq.slice(0, pos), i, ...seq.slice(pos)]
    const c = routeCost(ctx, r, cand)
    if (c === Infinity) continue
    const delta = c - s.costs[r]
    if (!best || delta < best.delta) best = { delta, route: r, pos }
  }
  return best
}

/** Inserción con arrepentimiento: prioridad alta primero; dentro, el mayor arrepentimiento. */
function recreate(ctx: Ctx, s: State): void {
  const routeCount = s.routes.length
  // Caché de la mejor inserción de cada pedido en cada ruta.
  const cache = new Map<number, (Insertion | null)[]>()
  for (const i of s.unrouted) {
    cache.set(
      i,
      Array.from({ length: routeCount }, (_, r) => bestInsertionInRoute(ctx, s, i, r))
    )
  }
  while (s.unrouted.size > 0) {
    let pick: { i: number; ins: Insertion; key: [number, number] } | null = null
    for (const i of s.unrouted) {
      const options = (cache.get(i) ?? []).filter((x): x is Insertion => x !== null)
      if (options.length === 0) continue
      options.sort((a, b) => a.delta - b.delta)
      const regret = options.length > 1 ? options[1].delta - options[0].delta : 1e6
      const key: [number, number] = [ctx.orders[i].priority, regret]
      if (
        !pick ||
        key[0] > pick.key[0] ||
        (key[0] === pick.key[0] && key[1] > pick.key[1] + 1e-12) ||
        (key[0] === pick.key[0] && Math.abs(key[1] - pick.key[1]) <= 1e-12 && i < pick.i)
      ) {
        pick = { i, ins: options[0], key }
      }
    }
    if (!pick) break // lo que queda no cabe en ninguna ruta
    const { i, ins } = pick
    s.routes[ins.route].splice(ins.pos, 0, i)
    s.costs[ins.route] += ins.delta
    s.unrouted.delete(i)
    cache.delete(i)
    for (const [j, row] of cache) row[ins.route] = bestInsertionInRoute(ctx, s, j, ins.route)
  }
}

function twoOpt(ctx: Ctx, s: State): boolean {
  for (let r = 0; r < s.routes.length; r++) {
    const seq = s.routes[r]
    for (let a = 0; a < seq.length - 1; a++) {
      for (let b = a + 1; b < seq.length; b++) {
        const cand = [...seq.slice(0, a), ...seq.slice(a, b + 1).reverse(), ...seq.slice(b + 1)]
        const c = routeCost(ctx, r, cand)
        if (c < s.costs[r] - 1e-9) {
          s.routes[r] = cand
          s.costs[r] = c
          return true
        }
      }
    }
  }
  return false
}

function relocate(ctx: Ctx, s: State): boolean {
  for (let ra = 0; ra < s.routes.length; ra++) {
    for (let pa = 0; pa < s.routes[ra].length; pa++) {
      const i = s.routes[ra][pa]
      const without = [...s.routes[ra].slice(0, pa), ...s.routes[ra].slice(pa + 1)]
      const cWithout = routeCost(ctx, ra, without)
      if (cWithout === Infinity) continue
      const gain = s.costs[ra] - cWithout
      for (let rb = 0; rb < s.routes.length; rb++) {
        const base = rb === ra ? without : s.routes[rb]
        const baseCost = rb === ra ? cWithout : s.costs[rb]
        for (let pb = 0; pb <= base.length; pb++) {
          if (rb === ra && pb === pa) continue
          const cand = [...base.slice(0, pb), i, ...base.slice(pb)]
          const c = routeCost(ctx, rb, cand)
          if (c === Infinity) continue
          if (c - baseCost < gain - 1e-9) {
            if (rb === ra) {
              s.routes[ra] = cand
              s.costs[ra] = c
            } else {
              s.routes[ra] = without
              s.costs[ra] = cWithout
              s.routes[rb] = cand
              s.costs[rb] = c
            }
            return true
          }
        }
      }
    }
  }
  return false
}

function swap(ctx: Ctx, s: State): boolean {
  for (let ra = 0; ra < s.routes.length; ra++) {
    for (let rb = ra + 1; rb < s.routes.length; rb++) {
      for (let pa = 0; pa < s.routes[ra].length; pa++) {
        for (let pb = 0; pb < s.routes[rb].length; pb++) {
          const a = [...s.routes[ra]]
          const b = [...s.routes[rb]]
          ;[a[pa], b[pb]] = [b[pb], a[pa]]
          const ca = routeCost(ctx, ra, a)
          if (ca === Infinity) continue
          const cb = routeCost(ctx, rb, b)
          if (cb === Infinity) continue
          if (ca + cb < s.costs[ra] + s.costs[rb] - 1e-9) {
            s.routes[ra] = a
            s.routes[rb] = b
            s.costs[ra] = ca
            s.costs[rb] = cb
            return true
          }
        }
      }
    }
  }
  return false
}

function localSearch(ctx: Ctx, s: State, deadline: number): void {
  let guard = 0
  while (Date.now() < deadline && guard++ < 10_000) {
    if (twoOpt(ctx, s)) continue
    if (relocate(ctx, s)) continue
    if (swap(ctx, s)) continue
    if (s.unrouted.size > 0) {
      const before = s.unrouted.size
      recreate(ctx, s)
      if (s.unrouted.size < before) continue
    }
    break
  }
}

/** Quita un pedido al azar y sus vecinos más cercanos (eliminación relacionada). */
function ruin(ctx: Ctx, s: State, random: () => number): void {
  const routed: number[] = []
  s.routes.forEach((r) => routed.push(...r))
  if (routed.length === 0) return
  const k = Math.max(2, Math.round(routed.length * (0.1 + random() * 0.2)))
  const seed = routed[Math.floor(random() * routed.length)]
  const byCloseness = [...routed].sort((a, b) => ctx.dist[seed + 1][a + 1] - ctx.dist[seed + 1][b + 1])
  const remove = new Set(byCloseness.slice(0, k))
  for (let r = 0; r < s.routes.length; r++) {
    const kept = s.routes[r].filter((i) => !remove.has(i))
    if (kept.length !== s.routes[r].length) {
      s.routes[r] = kept
      s.costs[r] = routeCost(ctx, r, kept)
    }
  }
  for (const i of remove) s.unrouted.add(i)
}

function toRoute(ctx: Ctx, v: number, seq: number[]): Route {
  const sim = simulate(ctx, v, seq, true)
  const vehicle = ctx.vehicles[v]
  const km = sim.distanceM / 1000
  return {
    vehicleId: vehicle.id,
    stops: sim.stops,
    startMin: sim.leaveMin,
    endMin: sim.returnMin,
    distanceKm: km,
    durationMin: sim.returnMin - sim.leaveMin,
    loadKg: sim.loadKg,
    costEur: km * vehicle.costPerKm,
    co2Kg: (km * (vehicle.electric ? CO2_G_PER_KM.electric : CO2_G_PER_KM.diesel)) / 1000,
    lateStops: sim.lateStops,
    overloaded: sim.loadKg > vehicle.capacityKg + 1e-9
  }
}

export function totalsOf(routes: Route[]): PlanTotals {
  const used = routes.filter((r) => r.stops.length > 0)
  return {
    distanceKm: used.reduce((a, r) => a + r.distanceKm, 0),
    durationMin: used.reduce((a, r) => a + r.durationMin, 0),
    costEur: used.reduce((a, r) => a + r.costEur, 0),
    co2Kg: used.reduce((a, r) => a + r.co2Kg, 0),
    lateStops: used.reduce((a, r) => a + r.lateStops, 0),
    vehiclesUsed: used.length,
    overloadedRoutes: used.filter((r) => r.overloaded).length
  }
}

function unassignedReason(ctx: Ctx, i: number): string {
  const maxCap = Math.max(0, ...ctx.vehicles.map((v) => v.capacityKg))
  if (ctx.weight[i] > maxCap) return `Pesa ${ctx.weight[i]} kg y ningún vehículo carga tanto.`
  if (ctx.vehicles.length === 0) return 'No hay vehículos disponibles.'
  const reachable = ctx.vehicles.some(
    (_, v) => ctx.vStart[v] + ctx.dur[0][i + 1] <= ctx.wEnd[i] && ctx.wStart[i] <= ctx.vEnd[v]
  )
  if (!reachable) return 'Su franja no encaja con la jornada de ningún vehículo.'
  return 'No cabe en ninguna ruta sin romper otra franja, la capacidad o la jornada.'
}

export function solve(input: SolveInput): SolveResult {
  const t0 = Date.now()
  const ctx = buildCtx(input)
  const deadline = t0 + (input.timeLimitMs ?? 30_000)
  const iterations = input.iterations ?? defaultIterations(input.orders.length)
  const restarts = Math.max(1, input.restarts ?? DEFAULT_RESTARTS)
  const perRun = Math.ceil(iterations / restarts)
  const baseSeed = input.seed ?? 7

  let best: State | null = null
  let bestCost = Infinity
  let done = 0
  // Varios arranques independientes con semillas distintas; gana el mejor.
  for (let r = 0; r < restarts && Date.now() < deadline; r++) {
    const random = rng(baseSeed + r * 7919)
    const current: State = {
      routes: ctx.vehicles.map(() => []),
      costs: ctx.vehicles.map(() => 0),
      unrouted: new Set(ctx.orders.map((_, i) => i))
    }
    recreate(ctx, current)
    localSearch(ctx, current, deadline)
    let run = current
    let runBest = clone(current)
    let runBestCost = totalCost(ctx, runBest)
    // Destrucción y reconstrucción con aceptación «récord a récord»: se acepta
    // un plan si no empeora más de un margen el mejor de este arranque, y el
    // margen se cierra vuelta a vuelta. Se cuenta en vueltas, no en segundos,
    // para que el resultado no dependa de la velocidad del ordenador.
    for (let it = 0; it < perRun && ctx.orders.length > 2 && Date.now() < deadline; it++, done++) {
      const cand = clone(run)
      ruin(ctx, cand, random)
      recreate(ctx, cand)
      localSearch(ctx, cand, deadline)
      const c = totalCost(ctx, cand)
      const margin = 0.03 * (1 - it / perRun)
      if (c < runBestCost * (1 + margin)) run = cand
      if (c < runBestCost - 1e-9) {
        runBest = clone(cand)
        runBestCost = c
      }
    }
    if (runBestCost < bestCost - 1e-9) {
      best = runBest
      bestCost = runBestCost
    }
  }

  const final = best!
  const routes = final.routes.map((seq, v) => toRoute(ctx, v, seq))
  const unassigned = [...final.unrouted]
    .sort((a, b) => a - b)
    .map((i) => ({ orderId: ctx.orders[i].id, reason: unassignedReason(ctx, i) }))
  return { routes, unassigned, totals: totalsOf(routes), solveMs: Date.now() - t0, iterations: done }
}

/**
 * Recalcula rutas a partir de una asignación dada (por ejemplo, tras mover
 * un pedido a mano). No rechaza nada: marca retrasos y sobrecargas.
 */
export function evaluateAssignment(
  input: Omit<SolveInput, 'timeLimitMs' | 'seed' | 'iterations' | 'restarts'>,
  assignment: Record<string, string[]>
): Route[] {
  const ctx = buildCtx(input)
  const index = new Map(ctx.orders.map((o, i) => [o.id, i]))
  return ctx.vehicles.map((vehicle, v) => {
    const ids = assignment[vehicle.id] ?? []
    const seq = ids.map((id) => {
      const i = index.get(id)
      if (i === undefined) throw new Error(`Pedido desconocido: ${id}`)
      return i
    })
    return toRoute(ctx, v, seq)
  })
}

export { simulate as _simulateForTests, buildCtx as _buildCtxForTests }
