// Geocodificación con Nominatim (OpenStreetMap): una consulta por segundo,
// como pide su política de uso, y caché en disco para no repetir direcciones.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LatLng } from '../../core/types'
import { fetchJson } from './http'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
let cache: Record<string, LatLng | null> | null = null
let last = 0

function cacheFile(): string {
  return join(app.getPath('userData'), 'geocode-cache.json')
}

function loadCache(): Record<string, LatLng | null> {
  if (cache) return cache
  try {
    cache = existsSync(cacheFile()) ? JSON.parse(readFileSync(cacheFile(), 'utf8')) : {}
  } catch {
    cache = {}
  }
  return cache!
}

function saveCache(): void {
  try {
    writeFileSync(cacheFile(), JSON.stringify(cache))
  } catch {
    // La caché es opcional.
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function geocode(address: string, countryCodes = 'es', near?: LatLng): Promise<LatLng | null> {
  const key = `${countryCodes}|${address.trim().toLowerCase()}`
  const c = loadCache()
  if (key in c) return c[key]
  const wait = 1100 - (Date.now() - last)
  if (wait > 0) await sleep(wait)
  last = Date.now()
  const params = new URLSearchParams({ q: address, format: 'jsonv2', limit: '1' })
  if (countryCodes.trim()) params.set('countrycodes', countryCodes.replace(/\s/g, ''))
  if (near) {
    // Prioriza resultados cerca del depósito sin excluir los demás.
    const d = 0.6
    params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`)
  }
  try {
    const res = await fetchJson<{ lat: string; lon: string }[]>(`${NOMINATIM}?${params}`, {
      headers: { 'Accept-Language': 'es' }
    })
    const hit = res[0] ? { lat: Number(res[0].lat), lng: Number(res[0].lon) } : null
    c[key] = hit
    saveCache()
    return hit
  } catch {
    return null // sin red: se reintenta la próxima vez
  }
}
