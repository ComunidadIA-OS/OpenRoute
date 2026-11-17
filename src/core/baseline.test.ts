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
