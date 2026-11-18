import type { AppLanguage } from './types'

const reasons: Record<string, string> = {
  'No hay vehículos disponibles.': 'No vehicles are available.',
  'Su franja no encaja con la jornada de ningún vehículo.': 'Its delivery window is outside every vehicle shift.',
  'No cabe en ninguna ruta sin romper otra franja, la capacidad o la jornada.':
    'No route can take this order while meeting the other delivery windows, capacity, and shift limits.',
  'No se ha encontrado la dirección en el mapa.': 'The address could not be found on the map.'
}

export function localizeUnassignedReason(reason: string, language: AppLanguage): string {
  if (language === 'es') return reason
  const weight = /^Pesa (.+) kg y ningún vehículo carga tanto\.$/.exec(reason)
  if (weight) return `The order weighs ${weight[1]} kg, more than any vehicle can carry.`
  return Object.hasOwn(reasons, reason) ? reasons[reason] : reason
}
