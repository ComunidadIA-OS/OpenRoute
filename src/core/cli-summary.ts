import type { AppLanguage, Plan } from './types'

const copy = {
  es: {
    intro:
      'Ayúdame a revisar este reparto a partir de los siguientes datos agregados. Dime qué conviene comprobar en OpenRoute.',
    orders: 'Pedidos',
    pending: 'Plan de rutas: pendiente de calcular.',
    plan: 'Plan de rutas',
    approved: 'aprobado',
    draft: 'borrador',
    vehicles: 'Vehículos usados',
    unassigned: 'Pedidos sin asignar',
    late: 'Paradas con retraso',
    overloaded: 'Rutas con sobrecarga',
    distance: 'Distancia total',
    duration: 'Duración acumulada',
    source: 'Fuente de distancias',
    distances: {
      osrm: 'viales (OSRM)',
      haversine: 'estimación sin motor vial',
      mixed: 'OSRM con estimaciones para algunos trayectos'
    }
  },
  en: {
    intro: 'Help me review this delivery plan using the following totals. Tell me what to check in OpenRoute.',
    orders: 'Orders',
    pending: 'Route plan: not calculated yet.',
    plan: 'Route plan',
    approved: 'approved',
    draft: 'draft',
    vehicles: 'Vehicles used',
    unassigned: 'Unassigned orders',
    late: 'Late stops',
    overloaded: 'Overloaded routes',
    distance: 'Total distance',
    duration: 'Total duration',
    source: 'Distance source',
    distances: {
      osrm: 'road network (OSRM)',
      haversine: 'estimated without a routing engine',
      mixed: 'OSRM with estimates for some legs'
    }
  }
}

/** Genera un texto para revisar antes de pegarlo en un terminal. */
export function cliSummary(orderCount: number, plan: Plan | null, language: AppLanguage = 'es'): string {
  const t = copy[language]
  const lines = [t.intro, '', `${t.orders}: ${orderCount}`]
  if (!plan) return [...lines, t.pending].join('\n')

  const decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 1 })
  const { totals } = plan
  return [
    ...lines,
    `${t.plan}: ${plan.status === 'approved' ? t.approved : t.draft}.`,
    `${t.vehicles}: ${totals.vehiclesUsed}`,
    `${t.unassigned}: ${plan.unassigned.length}`,
    `${t.late}: ${totals.lateStops}`,
    `${t.overloaded}: ${totals.overloadedRoutes}`,
    `${t.distance}: ${decimal.format(totals.distanceKm)} km`,
    `${t.duration}: ${decimal.format(totals.durationMin)} min`,
    `${t.source}: ${t.distances[plan.matrixSource]}`
  ].join('\n')
}
