import { describe, expect, it } from 'vitest'
import { googleMapsLegs, MAX_WAYPOINTS } from './maps-links'

const depot = { lat: 38.27, lng: -0.69 }
const stops = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 38.2 + i / 100, lng: -0.7 }))

describe('googleMapsLegs', () => {
  it('una ruta corta cabe en un solo enlace', () => {
    const links = googleMapsLegs(depot, stops(3))
    expect(links).toHaveLength(1)
    const url = new URL(links[0])
    expect(url.searchParams.get('origin')).toBe('38.270000,-0.690000')
    expect(url.searchParams.get('destination')).toBe('38.270000,-0.690000')
    expect(url.searchParams.get('waypoints')?.split('|')).toHaveLength(3)
  })

  it('parte las rutas largas en tramos encadenados', () => {
    const links = googleMapsLegs(depot, stops(25))
    expect(links.length).toBeGreaterThan(1)
    for (let i = 1; i < links.length; i++) {
      const prev = new URL(links[i - 1]).searchParams.get('destination')
      const next = new URL(links[i]).searchParams.get('origin')
      expect(next).toBe(prev)
    }
    for (const l of links) {
      const w = new URL(l).searchParams.get('waypoints')
      expect((w ? w.split('|') : []).length).toBeLessThanOrEqual(MAX_WAYPOINTS)
    }
  })

  it('sin paradas no hay enlace', () => {
    expect(googleMapsLegs(depot, [])).toEqual([])
  })
})
