// Hojas de ruta en PDF (una página por conductor) y plan en CSV.

import { BrowserWindow } from 'electron'
import { googleMapsLegs } from '../core/maps-links'
import { formatDuration, toHHMM } from '../core/time'
import type { Order } from '../core/types'
import { store, type Session } from './store'

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

const num = (n: number, d = 1): string => n.toFixed(d).replace('.', ',')

export function planCsv(session: Session): string {
  const plan = session.plan
  if (!plan) throw new Error('No hay plan que exportar.')
  const byId = new Map(session.orders.map((o) => [o.id, o]))
  const rows = [
    [
      'vehiculo',
      'orden',
      'id_pedido',
      'cliente',
      'direccion',
      'llegada',
      'franja_inicio',
      'franja_fin',
      'peso_kg',
      'retraso'
    ]
  ]
  for (const r of plan.routes) {
    r.stops.forEach((s, k) => {
      const o = byId.get(s.orderId) as Order
      rows.push([
        r.vehicleId,
        String(k + 1),
        o.id,
        o.customer,
        o.address,
        toHHMM(s.arrival + s.waitMin),
        o.windowStart,
        o.windowEnd,
        String(o.weightKg),
        s.late ? 'si' : 'no'
      ])
    })
  }
  for (const u of plan.unassigned) {
    const o = byId.get(u.orderId)
    rows.push([
      '',
      '',
      u.orderId,
      o?.customer ?? '',
      o?.address ?? '',
      '',
      o?.windowStart ?? '',
      o?.windowEnd ?? '',
      String(o?.weightKg ?? ''),
      `sin asignar: ${u.reason}`
    ])
  }
  return (
    '\uFEFF' +
    rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n')
  )
}

function sheetsHtml(session: Session): string {
  const plan = session.plan!
  const depot = store.state.depot!
  const vehicles = new Map(store.state.vehicles.map((v) => [v.id, v]))
  const byId = new Map(session.orders.map((o) => [o.id, o]))
  const pages = plan.routes
    .filter((r) => r.stops.length > 0)
    .map((r) => {
      const v = vehicles.get(r.vehicleId)
      const stops = r.stops.map((s) => byId.get(s.orderId)!)
      const links = googleMapsLegs(depot, stops as { lat: number; lng: number }[])
      return `<section>
  <header>
    <div class="brand">OpenRoute</div>
    <h1>${esc(v?.name ?? r.vehicleId)} <span>${esc(r.vehicleId)}</span></h1>
    <p>${esc(session.title)}${v?.driver ? ` · Conductor: ${esc(v.driver)}` : ''}</p>
    <ul class="kpis">
      <li><b>${r.stops.length}</b> paradas</li>
      <li><b>${num(r.distanceKm)} km</b></li>
      <li>Salida <b>${toHHMM(r.startMin)}</b> · regreso <b>${toHHMM(r.endMin)}</b> (${formatDuration(r.durationMin)})</li>
      <li>Carga <b>${Math.round(r.loadKg)} kg</b> de ${v?.capacityKg ?? '?'} kg</li>
    </ul>
  </header>
  <table>
    <thead><tr><th>#</th><th>Llegada</th><th>Cliente</th><th>Dirección</th><th>Franja</th><th>Kg</th><th>Notas</th><th>Firma</th></tr></thead>
    <tbody>
      ${r.stops
        .map((s, k) => {
          const o = byId.get(s.orderId)!
          return `<tr${s.late ? ' class="late"' : ''}><td>${k + 1}</td><td><b>${toHHMM(s.arrival + s.waitMin)}</b></td><td>${esc(o.customer)}<small>${esc(o.id)}</small></td><td>${esc(o.address)}</td><td>${o.windowStart}-${o.windowEnd}</td><td>${num(o.weightKg, 0)}</td><td>${esc(o.notes ?? '')}</td><td class="sign"></td></tr>`
        })
        .join('')}
    </tbody>
  </table>
  <footer>${links.map((l, k) => `<p>Google Maps${links.length > 1 ? ` (tramo ${k + 1})` : ''}: <a href="${esc(l)}">${esc(l)}</a></p>`).join('')}</footer>
</section>`
    })
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #0b100e; font-size: 10.5px; }
  section { page-break-after: always; }
  section:last-child { page-break-after: auto; }
  .brand { font-weight: 700; font-size: 11px; color: #1f7a4d; letter-spacing: -0.01em; }
  h1 { font-size: 20px; margin: 6px 0 2px; letter-spacing: -0.02em; }
  h1 span { font-size: 12px; color: #667; font-weight: 500; }
  header p { margin: 0 0 8px; color: #445; }
  .kpis { display: flex; gap: 18px; padding: 0; list-style: none; margin: 0 0 12px; color: #334; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; color: #556; border-bottom: 1.5px solid #0b100e; padding: 5px 4px; }
  td { border-bottom: 1px solid #dde3df; padding: 6px 4px; vertical-align: top; }
  td small { display: block; color: #889; }
  tr.late td { background: #fff1ec; }
  td.sign { width: 90px; }
  footer { margin-top: 10px; color: #445; word-break: break-all; }
  a { color: #1f7a4d; }
</style></head><body>${pages.join('')}</body></html>`
}

export async function planPdf(session: Session): Promise<Buffer> {
  if (!session.plan || !store.state.depot) throw new Error('No hay plan que exportar.')
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(sheetsHtml(session))}`)
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
  } finally {
    win.destroy()
  }
}
