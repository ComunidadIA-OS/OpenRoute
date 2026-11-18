import type { Plan } from './types'

const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const distanceSources: Record<Plan['matrixSource'], string> = {
  osrm: 'viales (OSRM)',
  haversine: 'estimación sin motor vial',
  mixed: 'OSRM con estimaciones para algunos trayectos'
}

/** Genera un texto para revisar antes de pegarlo en un terminal. */
export function cliSummary(orderCount: number, plan: Plan | null): string {
  const lines = [
    'Ayúdame a revisar este reparto a partir de los siguientes datos agregados. Dime qué conviene comprobar en OpenRoute.',
    '',
    `Pedidos: ${orderCount}`
  ]
  if (!plan) return [...lines, 'Plan de rutas: pendiente de calcular.'].join('\n')

  const { totals } = plan
  return [
    ...lines,
    `Plan de rutas: ${plan.status === 'approved' ? 'aprobado' : 'borrador'}.`,
    `Vehículos usados: ${totals.vehiclesUsed}`,
    `Pedidos sin asignar: ${plan.unassigned.length}`,
    `Paradas con retraso: ${totals.lateStops}`,
    `Rutas con sobrecarga: ${totals.overloadedRoutes}`,
    `Distancia total: ${decimal.format(totals.distanceKm)} km`,
    `Duración acumulada: ${decimal.format(totals.durationMin)} min`,
    `Fuente de distancias: ${distanceSources[plan.matrixSource]}`
  ].join('\n')
}
