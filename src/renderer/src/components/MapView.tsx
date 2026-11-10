import * as maplibregl from 'maplibre-gl'
import type { DataDrivenPropertyValueSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef } from 'react'
import { toHHMM } from '@core/time'
import type { Order } from '@core/types'
import { routeColor } from '../lib/format'
import { useUi } from '../store'

// El worker de MapLibre se sirve desde la propia app (sin CDN).
maplibregl.setWorkerUrl(workerUrl)

// Mapa base vectorial gratuito y sin clave (OpenFreeMap, datos de OpenStreetMap).
const STYLE = 'https://tiles.openfreemap.org/styles/dark'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function tint(map: MlMap): void {
  // Ajusta el estilo oscuro a la paleta de la marca.
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase()
    try {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#090d0b')
      else if (layer.type === 'fill' && id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', '#0a1513')
      else if (layer.type === 'fill' && (id.includes('park') || id.includes('landcover') || id.includes('wood')))
        map.setPaintProperty(layer.id, 'fill-color', '#0c130f')
      else if (layer.type === 'symbol') map.setPaintProperty(layer.id, 'text-color', '#7d8a84')
    } catch {
      // Algunas capas no admiten la propiedad; se dejan como están.
    }
  }
}

function popupHtml(o: Order, extra: string): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return `<div style="min-width:180px"><div style="font-weight:600;font-size:13px">${esc(o.customer)}</div>
  <div style="color:#a7b1ac;font-size:12px;margin-top:2px">${esc(o.address)}</div>
  <div style="display:flex;gap:10px;margin-top:8px;font-size:12px;color:#edf1ee">${extra}<span>${o.windowStart}-${o.windowEnd}</span><span>${o.weightKg} kg</span></div>
  <div style="color:#808b86;font-size:11px;margin-top:4px">${esc(o.id)}</div></div>`
}

export function MapView() {
  const app = useUi((s) => s.app)!
  const focus = useUi((s) => s.focusVehicle)
  const setFocus = useUi((s) => s.setFocusVehicle)
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const ready = useRef(false)
  const depotMarker = useRef<maplibregl.Marker | null>(null)
  const lastFit = useRef('')

  const session = app.active
  const plan = session?.plan ?? null
  const depot = app.depot

  const data = useMemo(() => {
    const orders = new Map((session?.orders ?? []).map((o) => [o.id, o]))
    const vehicleIndex = new Map(app.vehicles.map((v, i) => [v.id, i]))
    const routes: GeoJSON.Feature[] = []
    const stops: GeoJSON.Feature[] = []
    const planned = new Set<string>()
    plan?.routes.forEach((r) => {
      if (r.stops.length === 0) return
      const color = routeColor(vehicleIndex.get(r.vehicleId) ?? 0)
      const coords =
        r.geometry ??
        ([depot, ...r.stops.map((s) => orders.get(s.orderId)), depot]
          .filter(Boolean)
          .map((p) => [p!.lng!, p!.lat!]) as [number, number][])
      routes.push({
        type: 'Feature',
        properties: { vehicleId: r.vehicleId, color },
        geometry: { type: 'LineString', coordinates: coords }
      })
      r.stops.forEach((s, k) => {
        const o = orders.get(s.orderId)
        if (!o || o.lat === undefined || o.lng === undefined) return
        planned.add(o.id)
        stops.push({
          type: 'Feature',
          properties: {
            vehicleId: r.vehicleId,
            color,
            n: String(k + 1),
            orderId: o.id,
            eta: toHHMM(s.arrival + s.waitMin),
            late: s.late
          },
          geometry: { type: 'Point', coordinates: [o.lng, o.lat] }
        })
      })
    })
    const pending: GeoJSON.Feature[] = (session?.orders ?? [])
      .filter((o) => o.lat !== undefined && o.lng !== undefined && !planned.has(o.id))
      .map((o) => ({
        type: 'Feature',
        properties: { orderId: o.id, priority: o.priority, unassigned: Boolean(plan) },
        geometry: { type: 'Point', coordinates: [o.lng!, o.lat!] }
      }))
    return {
      orders,
      routes: { type: 'FeatureCollection', features: routes } as GeoJSON.FeatureCollection,
      stops: { type: 'FeatureCollection', features: stops } as GeoJSON.FeatureCollection,
      pending: { type: 'FeatureCollection', features: pending } as GeoJSON.FeatureCollection,
      depot,
      fitKey: `${plan?.id ?? 'none'}|${session?.id}|${session?.orders.length}|${depot?.lat}`
    }
  }, [session, plan, depot, app.vehicles])

  const dataRef = useRef(data)

  function sync(): void {
    const map = mapRef.current
    if (!map || !ready.current) return
    const d = dataRef.current
    const depot = d.depot
    ;(map.getSource('routes') as GeoJSONSource).setData(d.routes)
    ;(map.getSource('stops') as GeoJSONSource).setData(d.stops)
    ;(map.getSource('pending') as GeoJSONSource).setData(d.pending)

    if (depot) {
      if (!depotMarker.current) {
        const node = document.createElement('div')
        node.className =
          'flex h-6 w-6 items-center justify-center rounded-full border-2 border-ac bg-bg shadow-[0_0_0_6px_rgba(200,245,96,0.15)]'
        node.innerHTML = '<div class="h-2 w-2 rounded-full bg-ac"></div>'
        node.title = depot.name
        depotMarker.current = new maplibregl.Marker({ element: node }).setLngLat([depot.lng, depot.lat]).addTo(map)
      } else depotMarker.current.setLngLat([depot.lng, depot.lat])
    }

    if (d.fitKey !== lastFit.current) {
      lastFit.current = d.fitKey
      const pts: [number, number][] = []
      d.routes.features.forEach((f) =>
        pts.push(...((f.geometry as GeoJSON.LineString).coordinates as [number, number][]))
      )
      d.pending.features.forEach((f) => pts.push((f.geometry as GeoJSON.Point).coordinates as [number, number]))
      if (depot) pts.push([depot.lng, depot.lat])
      if (pts.length > 1) {
        const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
        map.fitBounds(b, { padding: { top: 90, bottom: 60, left: 60, right: 380 }, duration: 900, maxZoom: 14 })
      } else if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 12 })
    }
  }

  // Crear el mapa una vez.
  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [-0.6, 38.3],
      zoom: 10,
      attributionControl: { compact: true },
      fadeDuration: 0
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => {
      tint(map)
      map.addSource('routes', { type: 'geojson', data: EMPTY })
      map.addSource('stops', { type: 'geojson', data: EMPTY })
      map.addSource('pending', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'routes-casing',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#070a09', 'line-width': 7, 'line-opacity': 0.9 }
      })
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.4 }
      })
      map.addLayer({
        id: 'pending',
        type: 'circle',
        source: 'pending',
        paint: {
          'circle-radius': 5,
          'circle-color': ['case', ['get', 'unassigned'], '#ff8f78', '#edf1ee'],
          'circle-stroke-color': '#070a09',
          'circle-stroke-width': 2
        }
      })
      map.addLayer({
        id: 'stops',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': 9.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': ['case', ['get', 'late'], '#ff8f78', '#070a09'],
          'circle-stroke-width': 2
        }
      })
      map.addLayer({
        id: 'stops-label',
        type: 'symbol',
        source: 'stops',
        layout: {
          'text-field': ['get', 'n'],
          'text-size': 10.5,
          'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': true
        },
        paint: { 'text-color': '#0b1a07' }
      })
      const popup = new maplibregl.Popup({ closeButton: false, offset: 12 })
      const show = (e: maplibregl.MapLayerMouseEvent, withEta: boolean): void => {
        const f = e.features?.[0]
        const o = f && dataRef.current.orders.get(f.properties.orderId)
        if (!f || !o) return
        const extra = withEta ? `<span style="color:#c8f560;font-weight:600">${f.properties.eta}</span>` : ''
        popup.setLngLat(e.lngLat).setHTML(popupHtml(o, extra)).addTo(map)
      }
      map.on('mouseenter', 'stops', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        show(e, true)
      })
      map.on('mouseenter', 'pending', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        show(e, false)
      })
      for (const l of ['stops', 'pending']) {
        map.on('mouseleave', l, () => {
          map.getCanvas().style.cursor = ''
          popup.remove()
        })
      }
      map.on('click', 'routes-line', (e) => {
        const id = e.features?.[0]?.properties.vehicleId
        if (id) useUi.getState().setFocusVehicle(useUi.getState().focusVehicle === id ? null : id)
      })
      ready.current = true
      sync()
    })
    return () => {
      ready.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    dataRef.current = data
    sync()
  }, [data])

  // Resaltar un vehículo.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready.current) return
    const op = (dim: number): DataDrivenPropertyValueSpecification<number> =>
      (focus
        ? ['case', ['==', ['get', 'vehicleId'], focus], 1, dim]
        : 1) as DataDrivenPropertyValueSpecification<number>
    map.setPaintProperty('routes-line', 'line-opacity', op(0.15))
    map.setPaintProperty('stops', 'circle-opacity', op(0.2))
    map.setPaintProperty('stops-label', 'text-opacity', op(0.2))
    if (focus) {
      const f = data.routes.features.find((x) => x.properties?.vehicleId === focus)
      if (f) {
        const c = (f.geometry as GeoJSON.LineString).coordinates as [number, number][]
        const b = c.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(c[0], c[0]))
        map.fitBounds(b, { padding: { top: 90, bottom: 60, left: 60, right: 380 }, duration: 700, maxZoom: 15 })
      }
    }
  }, [focus, data])

  useEffect(() => {
    // Si el vehículo enfocado deja de tener ruta, se quita el foco.
    if (focus && !plan?.routes.some((r) => r.vehicleId === focus && r.stops.length)) setFocus(null)
  }, [plan, focus, setFocus])

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  )
}
