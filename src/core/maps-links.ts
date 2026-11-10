// Enlaces de Google Maps para el conductor: sin apps ni cuentas.
// La URL de indicaciones admite hasta 9 paradas intermedias, así que una ruta
// larga se parte en tramos que se encadenan (el destino de uno es el origen
// del siguiente).

import type { LatLng } from './types'

export const MAX_WAYPOINTS = 9

const fmt = (p: LatLng): string => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

export function googleMapsLegs(depot: LatLng, stops: LatLng[], returnToDepot = true): string[] {
  if (stops.length === 0) return []
  const path = [depot, ...stops, ...(returnToDepot ? [depot] : [])]
  const links: string[] = []
  let start = 0
  while (start < path.length - 1) {
    const end = Math.min(start + MAX_WAYPOINTS + 1, path.length - 1)
    const origin = path[start]
    const destination = path[end]
    const waypoints = path.slice(start + 1, end)
    const params = new URLSearchParams({
      api: '1',
      origin: fmt(origin),
      destination: fmt(destination),
      travelmode: 'driving'
    })
    if (waypoints.length > 0) params.set('waypoints', waypoints.map(fmt).join('|'))
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`)
    start = end
  }
  return links
}
