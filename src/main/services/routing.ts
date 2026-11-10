// Distancias y trazados por calles con OSRM. Si el servidor no responde, se
// usa la estimación en línea recta con factor de rodeo (ver core/geo.ts).

import { haversineMatrix } from '../../core/geo'
import type { LatLng, TravelMatrix } from '../../core/types'
import { fetchJson } from './http'

/** El servidor público de OSRM admite hasta 100 coordenadas por consulta de tabla. */
const MAX_TABLE = 100

const coord = (p: LatLng): string => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`

interface TableResponse {
  code: string
  distances?: (number | null)[][]
  durations?: (number | null)[][]
  message?: string
}

async function tableBlock(base: string, points: LatLng[], src: number[], dst: number[]): Promise<TableResponse> {
  const ids = [...new Set([...src, ...dst])]
  const pos = new Map(ids.map((id, k) => [id, k]))
  const url =
    `${base.replace(/\/$/, '')}/table/v1/driving/${ids.map((i) => coord(points[i])).join(';')}` +
    `?annotations=distance,duration&sources=${src.map((i) => pos.get(i)).join(';')}` +
    `&destinations=${dst.map((i) => pos.get(i)).join(';')}`
  const res = await fetchJson<TableResponse>(url, { timeoutMs: 15_000 })
  if (res.code !== 'Ok') throw new Error(res.message ?? res.code)
  return res
}

export async function travelMatrix(base: string, points: LatLng[]): Promise<TravelMatrix> {
  const n = points.length
  const fallback = haversineMatrix(points)
  if (n < 2 || !base) return fallback
  try {
    const distanceM = fallback.distanceM.map((r) => [...r])
    const durationS = fallback.durationS.map((r) => [...r])
    const half = Math.floor(MAX_TABLE / 2)
    const chunks: number[][] = []
    const step = n <= MAX_TABLE ? n : half
    for (let i = 0; i < n; i += step) chunks.push(Array.from({ length: Math.min(step, n - i) }, (_, k) => i + k))
    for (const src of chunks) {
      for (const dst of chunks) {
        const res = await tableBlock(base, points, src, dst)
        src.forEach((i, a) =>
          dst.forEach((j, b) => {
            const d = res.distances?.[a]?.[b]
            const t = res.durations?.[a]?.[b]
            // Si OSRM no encuentra ruta entre dos puntos, se mantiene la estimación.
            if (typeof d === 'number' && typeof t === 'number') {
              distanceM[i][j] = d
              durationS[i][j] = t
            }
          })
        )
      }
    }
    return { distanceM, durationS, source: 'osrm' }
  } catch {
    return fallback
  }
}

interface RouteResponse {
  code: string
  routes?: { geometry: { coordinates: [number, number][] } }[]
}

/** Trazado por calles de una secuencia de puntos (depósito, paradas, depósito). */
export async function routeGeometry(base: string, path: LatLng[]): Promise<[number, number][]> {
  const straight = path.map((p) => [p.lng, p.lat] as [number, number])
  if (!base || path.length < 2) return straight
  try {
    const out: [number, number][] = []
    // Tramos de hasta 100 puntos, solapando el último con el siguiente.
    for (let i = 0; i < path.length - 1; i += MAX_TABLE - 1) {
      const leg = path.slice(i, i + MAX_TABLE)
      const url = `${base.replace(/\/$/, '')}/route/v1/driving/${leg.map(coord).join(';')}?overview=full&geometries=geojson`
      const res = await fetchJson<RouteResponse>(url, { timeoutMs: 15_000 })
      const coords = res.routes?.[0]?.geometry.coordinates
      if (res.code !== 'Ok' || !coords) return straight
      out.push(...(out.length ? coords.slice(1) : coords))
    }
    return out
  } catch {
    return straight
  }
}
