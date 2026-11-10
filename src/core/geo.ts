import type { LatLng, TravelMatrix } from './types'

const EARTH_RADIUS_M = 6_371_000

/** Distancia en línea recta, en metros. */
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Factor de rodeo urbano: por calle se recorre más que en línea recta.
 * 1,3 es un valor habitual para ciudades europeas; solo se usa si no hay
 * motor de rutas disponible.
 */
export const ROAD_FACTOR = 1.3
/** Velocidad media de reparto en ciudad (km/h) para estimar tiempos sin motor de rutas. */
export const URBAN_SPEED_KMH = 28

/** Matriz aproximada cuando no hay motor de rutas (sin red, OSRM caído…). */
export function haversineMatrix(points: LatLng[]): TravelMatrix {
  const n = points.length
  const distanceM: number[][] = []
  const durationS: number[][] = []
  for (let i = 0; i < n; i++) {
    distanceM.push(new Array(n).fill(0))
    durationS.push(new Array(n).fill(0))
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = haversineM(points[i], points[j]) * ROAD_FACTOR
      distanceM[i][j] = d
      durationS[i][j] = (d / 1000 / URBAN_SPEED_KMH) * 3600
    }
  }
  return { distanceM, durationS, source: 'haversine' }
}

export function bounds(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ]
}
