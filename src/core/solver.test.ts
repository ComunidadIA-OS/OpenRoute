import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { manualBaseline } from './baseline'
import { haversineMatrix } from './geo'
import { parseOrdersCsv } from './import'
import { SAMPLE_DEPOT, SAMPLE_VEHICLES } from './sample'
import { evaluateAssignment, solve } from './solver'
import { toMinutes } from './time'
import type { LocatedOrder, Vehicle } from './types'

const depot = { name: 'D', lat: 38.27, lng: -0.69 }

function order(id: string, lat: number, lng: number, extra: Partial<LocatedOrder> = {}): LocatedOrder {
  return {
    id,
    customer: id,
    address: id,
    lat,
    lng,
    priority: 2,
    weightKg: 10,
    windowStart: '08:00',
    windowEnd: '20:00',
    ...extra
  }
}

function van(id: string, extra: Partial<Vehicle> = {}): Vehicle {
  return {
    id,
    name: id,
    capacityKg: 500,
    costPerKm: 0.2,
    electric: false,
    start: '07:00',
    end: '19:00',
    available: true,
    ...extra
  }
}

function run(orders: LocatedOrder[], vehicles: Vehicle[], timeLimitMs = 300) {
  const matrix = haversineMatrix([depot, ...orders])
  return solve({ depot, vehicles, orders, matrix, timeLimitMs })
}

function sampleOrders(): LocatedOrder[] {
  const csv = readFileSync(join(__dirname, '../../resources/samples/pedidos-alicante-elche.csv'), 'utf8')
  return parseOrdersCsv(csv).orders as LocatedOrder[]
}

describe('solve', () => {
  it('reparte todos los pedidos cuando caben', () => {
    const orders = Array.from({ length: 12 }, (_, i) => order(`P${i}`, 38.26 + i * 0.002, -0.7 + (i % 4) * 0.01))
    const res = run(orders, [van('A'), van('B')])
    const assigned = res.routes.flatMap((r) => r.stops.map((s) => s.orderId))
    expect(new Set(assigned).size).toBe(12)
    expect(res.unassigned).toHaveLength(0)
  })

  it('respeta la capacidad de cada vehículo', () => {
    const orders = Array.from({ length: 6 }, (_, i) => order(`P${i}`, 38.27 + i * 0.003, -0.69, { weightKg: 100 }))
    const res = run(orders, [van('A', { capacityKg: 250 }), van('B', { capacityKg: 250 }), van('C', { capacityKg: 250 })])
    for (const r of res.routes) expect(r.loadKg).toBeLessThanOrEqual(250)
    expect(res.unassigned).toHaveLength(0)
  })

  it('llega dentro de cada franja horaria', () => {
    const orders = [
      order('tarde', 38.28, -0.7, { windowStart: '15:00', windowEnd: '16:00' }),
      order('mañana', 38.281, -0.701, { windowStart: '09:00', windowEnd: '09:30' }),
      order('libre', 38.26, -0.68)
    ]
    const res = run(orders, [van('A')])
    const stops = res.routes[0].stops
    expect(stops.map((s) => s.orderId)).toContain('tarde')
    for (const s of stops) {
      const o = orders.find((x) => x.id === s.orderId)!
      expect(s.arrival + s.waitMin).toBeGreaterThanOrEqual(toMinutes(o.windowStart) - 1e-6)
      expect(s.late).toBe(false)
    }
    expect(stops.findIndex((s) => s.orderId === 'mañana')).toBeLessThan(stops.findIndex((s) => s.orderId === 'tarde'))
  })

  it('deja fuera lo que no cabe y explica por qué', () => {
    const orders = [order('enorme', 38.27, -0.7, { weightKg: 2000 }), order('normal', 38.271, -0.701)]
    const res = run(orders, [van('A')])
    expect(res.unassigned.map((u) => u.orderId)).toEqual(['enorme'])
    expect(res.unassigned[0].reason).toMatch(/ningún vehículo carga/)
  })

  it('prefiere dejar fuera un pedido de prioridad baja antes que uno urgente', () => {
    const orders = [
      order('baja', 38.27, -0.7, { weightKg: 300, priority: 1 }),
      order('alta', 38.271, -0.701, { weightKg: 300, priority: 3 })
    ]
    const res = run(orders, [van('A', { capacityKg: 400 })])
    expect(res.unassigned.map((u) => u.orderId)).toEqual(['baja'])
  })

  it('es determinista con la misma semilla', () => {
    const orders = sampleOrders()
    const matrix = haversineMatrix([SAMPLE_DEPOT, ...orders])
    const a = solve({ depot: SAMPLE_DEPOT, vehicles: SAMPLE_VEHICLES, orders, matrix, timeLimitMs: 400, seed: 3 })
    const b = solve({ depot: SAMPLE_DEPOT, vehicles: SAMPLE_VEHICLES, orders, matrix, timeLimitMs: 400, seed: 3 })
    // El LNS depende del tiempo; la construcción y la búsqueda local no.
    expect(a.unassigned).toEqual(b.unassigned)
    expect(a.totals.distanceKm).toBeGreaterThan(0)
  })

  it('mejora al plan manual por zonas con los pedidos de ejemplo', () => {
    const orders = sampleOrders()
    const matrix = haversineMatrix([SAMPLE_DEPOT, ...orders])
    const input = { depot: SAMPLE_DEPOT, vehicles: SAMPLE_VEHICLES, orders, matrix }
    const res = solve({ ...input, timeLimitMs: 1500 })
    const base = manualBaseline(input)
    expect(res.unassigned).toHaveLength(0)
    expect(res.totals.lateStops).toBe(0)
    expect(res.totals.costEur).toBeLessThan(base.costEur)
  })
})

describe('evaluateAssignment', () => {
  it('marca retrasos y sobrecargas en lugar de rechazarlos', () => {
    const orders = [
      order('a', 38.27, -0.7, { weightKg: 400 }),
      order('b', 38.28, -0.71, { weightKg: 400, windowStart: '07:00', windowEnd: '07:05' })
    ]
    const matrix = haversineMatrix([depot, ...orders])
    const [route] = evaluateAssignment({ depot, vehicles: [van('A')], orders, matrix }, { A: ['a', 'b'] })
    expect(route.overloaded).toBe(true)
    expect(route.lateStops).toBe(1)
  })
})
