// Plan manual de referencia: cómo planifica una pyme sin software.
//
// El jefe de tráfico mira el mapa, reparte zonas («esta la cubre Juan, esta
// María») y, dentro de cada zona, sale primero a lo urgente y a lo que cierra
// antes. No es una caricatura: es una heurística razonable. El ahorro que
// enseña la app se mide contra esto, no contra un plan absurdo.

import { evaluateAssignment, totalsOf, type SolveInput } from './solver'
import { toMinutes } from './time'
import type { PlanTotals } from './types'

/** K-means determinista sobre lat/lng para partir los pedidos en k zonas. */
export function zones(points: { lat: number; lng: number }[], k: number): number[] {
  const n = points.length
  if (n === 0 || k <= 0) return []
  k = Math.min(k, n)
  // Semillas repartidas por orden de longitud: estable y sin azar.
  const order = points.map((p, i) => ({ i, lng: p.lng })).sort((a, b) => a.lng - b.lng)
  let centroids = Array.from({ length: k }, (_, c) => {
    const p = points[order[Math.floor(((c + 0.5) * n) / k)].i]
    return { lat: p.lat, lng: p.lng }
  })
  let labels = new Array(n).fill(0)
  for (let iter = 0; iter < 30; iter++) {
    labels = points.map((p) => {
      let best = 0
      let bestD = Infinity
      centroids.forEach((c, j) => {
        const d = (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2
        if (d < bestD) {
          bestD = d
          best = j
        }
      })
      return best
    })
    const next = centroids.map((c, j) => {
      const members = points.filter((_, i) => labels[i] === j)
      if (members.length === 0) return c
      return {
        lat: members.reduce((a, p) => a + p.lat, 0) / members.length,
        lng: members.reduce((a, p) => a + p.lng, 0) / members.length
      }
    })
    const moved = next.some((c, j) => c.lat !== centroids[j].lat || c.lng !== centroids[j].lng)
    centroids = next
    if (!moved) break
  }
  return labels
}

export function manualBaseline(input: Omit<SolveInput, 'timeLimitMs' | 'seed'>): PlanTotals {
  const { vehicles, orders } = input
  if (vehicles.length === 0 || orders.length === 0) return totalsOf([])
  const labels = zones(orders, vehicles.length)
  const assignment: Record<string, string[]> = {}
  vehicles.forEach((v, z) => {
    assignment[v.id] = orders
      .filter((_, i) => labels[i] === z)
      .sort((a, b) => b.priority - a.priority || toMinutes(a.windowEnd) - toMinutes(b.windowEnd))
      .map((o) => o.id)
  })
  return totalsOf(evaluateAssignment(input, assignment))
}
