import Papa from 'papaparse'
import { describe, expect, it, vi } from 'vitest'
import { planCsv, planPdf } from './export'
import type { Session } from './store'

const { loadURL, printToPDF, destroy } = vi.hoisted(() => ({
  loadURL: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
  printToPDF: vi.fn().mockResolvedValue(Buffer.from('%PDF')),
  destroy: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    loadURL = loadURL
    webContents = { printToPDF }
    destroy = destroy
  }
}))
vi.mock('./store', () => ({ store: { state: { depot: { lat: 38.3, lng: -0.5 }, vehicles: [] } } }))

const session: Session = {
  id: 'sesión',
  title: 'Reparto',
  createdAt: '',
  updatedAt: '',
  messages: [],
  history: [],
  orders: [
    {
      id: 'A',
      customer: '  =1+1',
      address: 'Calle "Mayor"; 2\rLocal',
      lat: 38.4,
      lng: -0.4,
      priority: 2,
      weightKg: 2.5,
      windowStart: '09:00',
      windowEnd: '12:00'
    }
  ],
  plan: {
    id: 'plan',
    createdAt: '',
    status: 'draft',
    matrixSource: 'haversine',
    solveMs: 0,
    serviceMin: 8,
    totals: { distanceKm: 0, durationMin: 0, costEur: 0, co2Kg: 0, lateStops: 0, vehiclesUsed: 1, overloadedRoutes: 0 },
    routes: [
      {
        vehicleId: 'F1',
        startMin: 500,
        endMin: 600,
        distanceKm: 0,
        durationMin: 100,
        loadKg: 2.5,
        costEur: 0,
        co2Kg: 0,
        lateStops: 0,
        overloaded: false,
        stops: [{ orderId: 'A', arrival: 530, waitMin: 10, departure: 548, late: false, lateMin: 0 }]
      }
    ],
    unassigned: []
  }
}

describe('planCsv', () => {
  it('exporta en inglés y conserva el formato que reconoce la importación de pedidos', () => {
    const csv = planCsv(
      {
        ...session,
        plan: { ...session.plan!, unassigned: [{ orderId: 'P2', reason: 'No hay vehículos disponibles.' }] }
      },
      'en'
    )
    const { data, errors } = Papa.parse(csv, { header: true, delimiter: ',' })
    expect(errors).toEqual([])
    expect(data).toEqual([
      expect.objectContaining({ vehicle: 'F1', stop_number: '1', order_id: 'A', weight_kg: '2.5', late: 'no' }),
      expect.objectContaining({ order_id: 'P2', late: 'unassigned: No vehicles are available.' })
    ])
  })
  it('mantiene el id y el motivo de un pedido sin ruta ni datos de contacto', () => {
    const csv = planCsv({
      ...session,
      orders: [],
      plan: {
        ...session.plan!,
        routes: [],
        unassigned: [{ orderId: 'P9', reason: 'Sin vehículo; capacidad insuficiente' }]
      }
    })
    const { data } = Papa.parse(csv, { header: true, delimiter: ';' })
    expect(data).toEqual([
      expect.objectContaining({
        id_pedido: 'P9',
        vehiculo: '',
        cliente: '',
        llegada: '',
        retraso: 'sin asignar: Sin vehículo; capacidad insuficiente'
      })
    ])
  })

  it('conserva acentos y separadores y exporta texto que podría interpretarse como fórmula', () => {
    const csv = planCsv(session)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const parsed = Papa.parse(csv, { header: true, delimiter: ';' })
    expect(parsed.errors).toEqual([])
    expect(parsed.data).toEqual([
      {
        vehiculo: 'F1',
        orden: '1',
        id_pedido: 'A',
        cliente: "'  =1+1",
        direccion: 'Calle "Mayor"; 2\rLocal',
        llegada: '09:00',
        franja_inicio: '09:00',
        franja_fin: '12:00',
        peso_kg: '2.5',
        retraso: 'no'
      }
    ])
  })
})

describe('planPdf', () => {
  it('imprime las columnas, los pesos y los motivos del motor en inglés', async () => {
    await planPdf(
      {
        ...session,
        plan: { ...session.plan!, unassigned: [{ orderId: 'P2', reason: 'Pesa 50 kg y ningún vehículo carga tanto.' }] }
      },
      'en'
    )
    const html = decodeURIComponent(loadURL.mock.lastCall![0])
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<th>Arrival</th>')
    expect(html).toContain('<th>Signature</th>')
    expect(html).toContain('<b>2.5 kg</b>')
    expect(html).toContain('<h1>Unassigned orders</h1>')
    expect(html).toContain('The order weighs 50 kg, more than any vehicle can carry.')
  })
  it('cierra la ventana auxiliar también cuando Chromium no puede imprimir', async () => {
    destroy.mockClear()
    printToPDF.mockRejectedValueOnce(new Error('No se pudo imprimir'))
    await expect(planPdf(session)).rejects.toThrow('No se pudo imprimir')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('imprime un mensaje útil si el plan no tiene paradas ni exclusiones', async () => {
    await planPdf({ ...session, plan: { ...session.plan!, routes: [] } })
    const html = decodeURIComponent(loadURL.mock.lastCall![0])
    expect(html).toContain('<h1>Hojas de ruta</h1>')
    expect(html).toContain('El plan no contiene paradas.')
  })

  it('conserva los decimales de peso de la parada y de la ruta', async () => {
    await planPdf(session)
    const html = decodeURIComponent(loadURL.mock.lastCall![0])
    expect(html).toContain('<b>2,5 kg</b>')
    expect(html).toContain('<td>2,5</td>')
    expect(printToPDF).toHaveBeenCalledWith({ pageSize: 'A4', printBackground: true })
    expect(destroy).toHaveBeenCalled()
  })

  it('muestra los motivos de los pedidos sin asignar aunque no haya rutas', async () => {
    await planPdf({
      ...session,
      plan: { ...session.plan!, routes: [], unassigned: [{ orderId: 'A', reason: 'Capacidad < 2,5 kg' }] }
    })
    const html = decodeURIComponent(loadURL.mock.lastCall![0])
    expect(html).toContain('<h1>Pedidos sin asignar</h1>')
    expect(html).toContain('<small>A</small>')
    expect(html).toContain('Capacidad &lt; 2,5 kg')
  })
})
