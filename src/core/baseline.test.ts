import { expect, it } from 'vitest'
import { manualBaseline, zones } from './baseline'
import { haversineMatrix } from './geo'
import { SAMPLE_DEPOT, SAMPLE_VEHICLES } from './sample'
import type { LocatedOrder } from './types'

const order: LocatedOrder = {
  id: 'A',
  customer: 'A',
  address: 'A',
  lat: 38.27,
  lng: -0.69,
  priority: 2,
  weightKg: 10,
  windowStart: '08:00',
  windowEnd: '20:00'
}

it('devuelve totales neutros para un plan manual sin flota', () => {
  const depot = SAMPLE_DEPOT
  const matrix = haversineMatrix([depot, order])
  expect(manualBaseline({ depot, vehicles: [], orders: [order], matrix })).toEqual({
    distanceKm: 0,
    durationMin: 0,
    costEur: 0,
    co2Kg: 0,
    lateStops: 0,
    vehiclesUsed: 0,
    overloadedRoutes: 0
  })
})

it('sirve primero los pedidos urgentes en el plan manual de una zona', () => {
  const depot = SAMPLE_DEPOT
  const orders = [
    { ...order, id: 'normal', windowEnd: '08:10' },
    { ...order, id: 'urgente', priority: 3 as const, windowEnd: '08:20' }
  ]
  const matrix = {
    distanceM: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ],
    durationS: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ],
    source: 'osrm' as const
  }
  const vehicles = [{ ...SAMPLE_VEHICLES[0], start: '08:00' }]
  const result = manualBaseline({ depot, vehicles, orders, matrix, serviceMin: 15 })
  expect(result).toMatchObject({ lateStops: 1, durationMin: 30, vehiclesUsed: 1 })
})

it('limita las zonas a las ubicaciones disponibles', () => {
  expect(
    zones(
      [
        { lat: 1, lng: 2 },
        { lat: 1, lng: -2 }
      ],
      5
    )
  ).toEqual([1, 0])
})
