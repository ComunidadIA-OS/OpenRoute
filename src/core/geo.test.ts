import { expect, it } from 'vitest'
import { bounds, haversineM, haversineMatrix } from './geo'

it('mide el arco corto entre puntos a ambos lados del antimeridiano', () => {
  const first = { lat: 0, lng: 179.9 }
  const second = { lat: 0, lng: -179.9 }
  expect(haversineM(first, second)).toBeCloseTo(22_238.985, 2)
  expect(haversineM(second, first)).toBeCloseTo(haversineM(first, second), 5)
})

it('estima distancias en metros y tiempos en segundos para ambos sentidos', () => {
  const first = { lat: 0, lng: 0 }
  const second = { lat: 0, lng: 1 }
  const matrix = haversineMatrix([first, second])
  expect(matrix.source).toBe('haversine')
  expect(matrix.distanceM[0][0]).toBe(0)
  expect(matrix.durationS[1][1]).toBe(0)
  expect(matrix.distanceM[0][1]).toBeCloseTo(144_553.405, 2)
  expect(matrix.durationS[0][1]).toBeCloseTo(18_585.438, 2)
  expect(matrix.distanceM[1][0]).toBeCloseTo(matrix.distanceM[0][1], 5)
  expect(matrix.durationS[1][0]).toBeCloseTo(matrix.durationS[0][1], 5)
})
