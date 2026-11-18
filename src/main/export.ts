// Hojas de ruta en PDF (una sección por conductor) y plan en CSV.

import { BrowserWindow } from 'electron'
import Papa from 'papaparse'
import { googleMapsLegs } from '../core/maps-links'
import { localizeUnassignedReason } from '../core/route-language'
import { formatDuration, toHHMM } from '../core/time'
import type { AppLanguage, Order } from '../core/types'
import { store, type Session } from './store'

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )

const copy = {
  es: {
    missingPlan: 'No hay plan que exportar.',
    csv: [
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
    ],
    pdf: ['#', 'Llegada', 'Cliente', 'Dirección', 'Franja', 'Kg', 'Notas', 'Firma'],
    reasonCols: ['Cliente', 'Dirección', 'Motivo'],
    yes: 'si',
    no: 'no',
    unassigned: 'sin asignar',
    driver: 'Conductor',
    stops: 'paradas',
    departure: 'Salida',
    return: 'regreso',
    load: 'Carga',
    of: 'de',
    leg: 'tramo',
    unassignedOrders: 'Pedidos sin asignar',
    routeSheets: 'Hojas de ruta',
    noStops: 'El plan no contiene paradas.'
  },
  en: {
    missingPlan: 'There is no plan to export.',
    csv: [
      'vehicle',
      'stop_number',
      'order_id',
      'customer',
      'address',
      'arrival',
      'window_start',
      'window_end',
      'weight_kg',
      'late'
    ],
    pdf: ['#', 'Arrival', 'Customer', 'Address', 'Window', 'Kg', 'Notes', 'Signature'],
    reasonCols: ['Customer', 'Address', 'Reason'],
    yes: 'yes',
    no: 'no',
    unassigned: 'unassigned',
    driver: 'Driver',
    stops: 'stops',
    departure: 'Departure',
    return: 'return',
    load: 'Load',
    of: 'of',
    leg: 'leg',
    unassignedOrders: 'Unassigned orders',
    routeSheets: 'Route sheets',
    noStops: 'The plan has no stops.'
  }
}

const headings = (labels: string[]): string => labels.map((label) => `<th>${esc(label)}</th>`).join('')

export function planCsv(session: Session, language: AppLanguage = 'es'): string {
  const t = copy[language]
  const plan = session.plan
  if (!plan) throw new Error(t.missingPlan)
  const byId = new Map(session.orders.map((o) => [o.id, o]))
  const rows = [t.csv]
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
        s.late ? t.yes : t.no
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
      `${t.unassigned}: ${localizeUnassignedReason(u.reason, language)}`
    ])
  }
  return (
    '\uFEFF' +
    Papa.unparse(rows, { delimiter: language === 'en' ? ',' : ';', escapeFormulae: /^(?:[\t\r\n]|\s*[=+\-@])/ })
  )
}

function sheetsHtml(session: Session, language: AppLanguage): string {
  const t = copy[language]
  const distance = new Intl.NumberFormat(language, {
    useGrouping: false,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
  const weight = new Intl.NumberFormat(language, { useGrouping: false, maximumFractionDigits: 6 })
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
    <p>${esc(session.title)}${v?.driver ? ` · ${t.driver}: ${esc(v.driver)}` : ''}</p>
    <ul class="kpis">
      <li><b>${r.stops.length}</b> ${t.stops}</li>
      <li><b>${distance.format(r.distanceKm)} km</b></li>
      <li>${t.departure} <b>${toHHMM(r.startMin)}</b> · ${t.return} <b>${toHHMM(r.endMin)}</b> (${formatDuration(r.durationMin)})</li>
      <li>${t.load} <b>${weight.format(r.loadKg)} kg</b> ${t.of} ${v ? weight.format(v.capacityKg) : '?'} kg</li>
    </ul>
  </header>
  <table>
    <thead><tr>${headings(t.pdf)}</tr></thead>
    <tbody>
      ${r.stops
        .map((s, k) => {
          const o = byId.get(s.orderId)!
          return `<tr${s.late ? ' class="late"' : ''}><td>${k + 1}</td><td><b>${toHHMM(s.arrival + s.waitMin)}</b></td><td>${esc(o.customer)}<small>${esc(o.id)}</small></td><td>${esc(o.address)}</td><td>${esc(o.windowStart)}-${esc(o.windowEnd)}</td><td>${weight.format(o.weightKg)}</td><td>${esc(o.notes ?? '')}</td><td class="sign"></td></tr>`
        })
        .join('')}
    </tbody>
  </table>
  <footer>${links.map((l, k) => `<p>Google Maps${links.length > 1 ? ` (${t.leg} ${k + 1})` : ''}: <a href="${esc(l)}">${esc(l)}</a></p>`).join('')}</footer>
</section>`
    })
  if (plan.unassigned.length > 0 || pages.length === 0) {
    const rows = plan.unassigned.map(({ orderId, reason }) => {
      const order = byId.get(orderId)
      return `<tr><td>${esc(order?.customer)}<small>${esc(orderId)}</small></td><td>${esc(order?.address)}</td><td>${esc(localizeUnassignedReason(reason, language))}</td></tr>`
    })
    pages.push(`<section>
  <header><div class="brand">OpenRoute</div><h1>${rows.length ? t.unassignedOrders : t.routeSheets}</h1><p>${esc(session.title)}</p></header>
  ${rows.length ? `<table><thead><tr>${headings(t.reasonCols)}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p>${t.noStops}</p>`}
</section>`)
  }
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
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
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { text-align: left; font-weight: 600; color: #556; border-bottom: 1.5px solid #0b100e; padding: 5px 4px; }
  td { border-bottom: 1px solid #dde3df; padding: 6px 4px; vertical-align: top; overflow-wrap: anywhere; }
  td small { display: block; color: #889; }
  tr.late td { background: #fff1ec; }
  td.sign { width: 90px; }
  footer { margin-top: 10px; color: #445; word-break: break-all; }
  a { color: #1f7a4d; }
</style></head><body>${pages.join('')}</body></html>`
}

export async function planPdf(session: Session, language: AppLanguage = 'es'): Promise<Buffer> {
  if (!session.plan || !store.state.depot) throw new Error(copy[language].missingPlan)
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(sheetsHtml(session, language))}`)
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
  } finally {
    win.destroy()
  }
}
