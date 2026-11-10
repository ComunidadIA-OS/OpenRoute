// Importación de pedidos desde CSV o Excel con cabeceras flexibles.
// Acepta cabeceras en español o inglés, con o sin tildes, y separador «,» o «;».

import Papa from 'papaparse'
import { isTime, toHHMM, toMinutes } from './time'
import type { Order, Priority } from './types'

export interface ImportIssue {
  /** Fila del archivo, contando la cabecera como fila 1. */
  row: number
  message: string
}

export interface ImportResult {
  orders: Order[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
  /** Columnas reconocidas: campo -> cabecera original. */
  columns: Record<string, string>
}

type Field =
  | 'id'
  | 'customer'
  | 'address'
  | 'city'
  | 'postal'
  | 'lat'
  | 'lng'
  | 'priority'
  | 'weight'
  | 'windowStart'
  | 'windowEnd'
  | 'notes'
  | 'service'

const SYNONYMS: Record<Field, string[]> = {
  id: ['id', 'id_pedido', 'pedido', 'n_pedido', 'num_pedido', 'order', 'order_id', 'codigo', 'ref', 'referencia'],
  customer: ['cliente', 'customer', 'nombre', 'name', 'destinatario', 'empresa'],
  address: ['direccion', 'address', 'domicilio', 'calle', 'direccion_entrega'],
  city: ['ciudad', 'poblacion', 'localidad', 'municipio', 'city', 'town'],
  postal: ['cp', 'codigo_postal', 'postal', 'postal_code', 'zip'],
  lat: ['lat', 'latitud', 'latitude'],
  lng: ['lon', 'lng', 'long', 'longitud', 'longitude'],
  priority: ['prioridad', 'priority', 'urgencia'],
  weight: ['peso_kg', 'peso', 'kg', 'kilos', 'weight', 'weight_kg'],
  windowStart: ['franja_inicio', 'desde', 'hora_inicio', 'inicio', 'ventana_inicio', 'window_start', 'from', 'start'],
  windowEnd: ['franja_fin', 'hasta', 'hora_fin', 'fin', 'ventana_fin', 'window_end', 'to', 'end'],
  notes: ['observaciones', 'notas', 'notes', 'comentarios', 'comments'],
  service: ['tiempo_servicio', 'servicio_min', 'minutos_parada', 'service_min', 'service_time']
}

export const DEFAULT_WINDOW = { start: '08:00', end: '20:00' }

export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function mapColumns(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {}
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }))
  for (const field of Object.keys(SYNONYMS) as Field[]) {
    const hit = normalized.find((h) => SYNONYMS[field].includes(h.norm))
    if (hit) out[field] = hit.raw
  }
  return out
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const s = value.trim().replace(/\s/g, '')
  if (s === '') return null
  // «1.234,5» -> 1234.5 ; «15,5» -> 15.5
  const cleaned = s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parsePriority(value: unknown): Priority {
  const s = String(value ?? '').trim().toLowerCase()
  if (['3', 'alta', 'high', 'urgente', 'a'].includes(s)) return 3
  if (['1', 'baja', 'low', 'c'].includes(s)) return 1
  return 2
}

export function parseTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return toHHMM(value.getHours() * 60 + value.getMinutes())
  if (typeof value === 'number') {
    // Excel guarda las horas como fracción del día (0,375 = 09:00).
    if (value >= 0 && value < 1) return toHHMM(Math.round(value * 24 * 60))
    if (value >= 0 && value <= 24) return toHHMM(Math.round(value * 60))
    return null
  }
  const s = String(value).trim().toLowerCase().replace(/h$/, '').replace('.', ':')
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s)
    return h <= 24 ? toHHMM(h * 60) : null
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const hhmm = s.split(':').slice(0, 2).join(':')
    return isTime(hhmm) ? toHHMM(toMinutes(hhmm)) : null
  }
  return null
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** Convierte filas (objetos cabecera -> valor) en pedidos validados. */
export function rowsToOrders(rows: Record<string, unknown>[], headers: string[]): ImportResult {
  const cols = mapColumns(headers)
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const orders: Order[] = []
  const seen = new Set<string>()

  if (!cols.address && !(cols.lat && cols.lng)) {
    errors.push({ row: 1, message: 'Falta una columna de dirección o las columnas lat y lon.' })
    return { orders, errors, warnings, columns: cols as Record<string, string> }
  }

  rows.forEach((r, idx) => {
    const row = idx + 2
    const get = (f: Field): unknown => (cols[f] ? r[cols[f] as string] : undefined)
    const values = Object.values(r).map(text).filter(Boolean)
    if (values.length === 0) return // fila vacía

    let address = text(get('address'))
    const city = text(get('city'))
    const postal = text(get('postal'))
    if (city && !address.toLowerCase().includes(city.toLowerCase())) address = `${address}, ${city}`.replace(/^, /, '')
    if (postal && !address.includes(postal)) address = `${address} ${postal}`.trim()

    const lat = parseNumber(get('lat'))
    const lng = parseNumber(get('lng'))
    const hasCoords = lat !== null && lng !== null
    if (hasCoords && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      errors.push({ row, message: `Coordenadas fuera de rango (${lat}, ${lng}).` })
      return
    }
    if (!address && !hasCoords) {
      errors.push({ row, message: 'Sin dirección ni coordenadas.' })
      return
    }

    let id = text(get('id')) || `P-${String(idx + 1).padStart(3, '0')}`
    if (seen.has(id)) {
      const fresh = `${id}-${row}`
      warnings.push({ row, message: `Id repetido «${id}»: se guarda como «${fresh}».` })
      id = fresh
    }
    seen.add(id)

    const weightRaw = parseNumber(get('weight'))
    if (cols.weight && weightRaw === null && text(get('weight')) !== '') {
      warnings.push({ row, message: `Peso no válido «${text(get('weight'))}»: se usa 0 kg.` })
    }
    const weightKg = Math.max(0, weightRaw ?? 0)

    let windowStart = parseTime(get('windowStart'))
    let windowEnd = parseTime(get('windowEnd'))
    if (cols.windowStart && !windowStart && text(get('windowStart'))) {
      warnings.push({ row, message: `Hora de inicio no válida «${text(get('windowStart'))}».` })
    }
    if (cols.windowEnd && !windowEnd && text(get('windowEnd'))) {
      warnings.push({ row, message: `Hora de fin no válida «${text(get('windowEnd'))}».` })
    }
    windowStart = windowStart ?? DEFAULT_WINDOW.start
    windowEnd = windowEnd ?? DEFAULT_WINDOW.end
    if (toMinutes(windowStart) >= toMinutes(windowEnd)) {
      errors.push({ row, message: `La franja ${windowStart}-${windowEnd} no es válida.` })
      return
    }

    const service = parseNumber(get('service'))
    orders.push({
      id,
      customer: text(get('customer')) || id,
      address: address || `${lat}, ${lng}`,
      ...(hasCoords ? { lat, lng } : {}),
      priority: parsePriority(get('priority')),
      weightKg,
      windowStart,
      windowEnd,
      ...(text(get('notes')) ? { notes: text(get('notes')) } : {}),
      ...(service !== null && service >= 0 ? { serviceMin: service } : {})
    })
  })

  return { orders, errors, warnings, columns: cols as Record<string, string> }
}

export function parseOrdersCsv(csv: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim()
  })
  const headers = parsed.meta.fields ?? []
  const result = rowsToOrders(parsed.data, headers)
  for (const e of parsed.errors.slice(0, 20)) {
    result.warnings.push({ row: (e.row ?? 0) + 2, message: `CSV: ${e.message}` })
  }
  return result
}

/** Filas tipo Excel (la primera es la cabecera). */
export function parseOrdersTable(table: unknown[][]): ImportResult {
  if (table.length === 0) return { orders: [], errors: [{ row: 1, message: 'El archivo está vacío.' }], warnings: [], columns: {} }
  const headers = table[0].map((h) => text(h))
  const rows = table.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i]])))
  return rowsToOrders(rows, headers)
}
