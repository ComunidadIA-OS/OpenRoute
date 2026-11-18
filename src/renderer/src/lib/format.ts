export const ROUTE_COLORS = ['#c8f560', '#6cc6ff', '#ff8f78', '#f2a93b', '#b79cff', '#5be3b5', '#ff7ac6', '#e8d27a']

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length]
}

function formatMetrics(locale: string) {
  const distance = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const mass = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
  return {
    km: (n: number): string => `${distance.format(n)} km`,
    kg: (n: number): string => `${mass.format(n)} kg`,
    eur: (n: number): string => currency.format(n)
  }
}

export const metricFormats = { es: formatMetrics('es-ES'), en: formatMetrics('en') }

export function savingPct(now: number, before: number): number {
  if (!before) return 0
  return Math.round(((before - now) / before) * 100)
}

export function relativeTime(iso: string, now: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return now
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`
  return `${Math.floor(diff / 86400)} d`
}

export const priorityLabel = { 3: 'Alta', 2: 'Media', 1: 'Baja' } as const

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
