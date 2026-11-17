import { expect, it } from 'vitest'
import { bounds, haversineM, haversineMatrix } from './geo'

it('mide el arco corto entre puntos a ambos lados del antimeridiano', () => {
  const first = { lat: 0, lng: 179.9 }
  const second = { lat: 0, lng: -179.9 }
  expect(haversineM(first, second)).toBeCloseTo(22_238.985, 2)
  expect(haversineM(second, first)).toBeCloseTo(haversineM(first, second), 5)
})
