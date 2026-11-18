import { describe, expect, it } from 'vitest'
import { cliSummary } from './cli-summary'
import type { Plan } from './types'

const plan: Plan = {
  id: 'plan-privado',
  createdAt: '2026-11-17T10:00:00Z',
  status: 'draft',
  routes: [],
  unassigned: [{ orderId: 'pedido-privado', reason: 'diagnóstico privado' }],
  totals: {
    distanceKm: 4.2,
    durationMin: 30,
    costEur: 10,
    co2Kg: 1,
    lateStops: 2,
    vehiclesUsed: 3,
    overloadedRoutes: 1
  },
  matrixSource: 'haversine',
  solveMs: 10,
  serviceMin: 8
}

describe('resumen para pegar en el terminal', () => {
  it('traduce el resumen y el formato decimal sin incluir datos privados', () => {
    const summary = cliSummary(7, { ...plan, status: 'approved', matrixSource: 'mixed' }, 'en')
    expect(summary).toContain('Route plan: approved.')
    expect(summary).toContain('Unassigned orders: 1')
    expect(summary).toContain('Total distance: 4.2 km')
    expect(summary).toContain('OSRM with estimates for some legs')
    expect(summary).not.toContain('privado')
  })
  it('comunica cuándo aún no hay plan', () => {
    expect(cliSummary(4, null)).toContain('Pedidos: 4\nPlan de rutas: pendiente de calcular.')
  })

  it('utiliza totales del motor y deja fuera los identificadores y diagnósticos privados', () => {
    const summary = cliSummary(7, plan)
    expect(summary).toContain('Vehículos usados: 3')
    expect(summary).toContain('Pedidos sin asignar: 1')
    expect(summary).toContain('Paradas con retraso: 2')
    expect(summary).toContain('Distancia total: 4,2 km')
    expect(summary).toContain('estimación sin motor vial')
    expect(summary).not.toContain('privado')
  })

  it('distingue los planes con una mezcla de trayectos viales y estimados', () => {
    expect(cliSummary(7, { ...plan, matrixSource: 'mixed' })).toContain('OSRM con estimaciones para algunos trayectos')
  })
})
