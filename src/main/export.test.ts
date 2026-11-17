import Papa from 'papaparse'
import { describe, expect, it, vi } from 'vitest'
import { planCsv } from './export'
import type { Session } from './store'

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))
vi.mock('./store', () => ({ store: { state: {} } }))

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
