export const ROUTE_COLORS = ['#c8f560', '#6cc6ff', '#ff8f78', '#f2a93b', '#b79cff', '#5be3b5', '#ff7ac6', '#e8d27a']

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length]
}

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const km = (n: number): string => `${nf1.format(n)} km`
export const kg = (n: number): string => `${nf0.format(n)} kg`
export const eur = (n: number): string => eurFmt.format(n)
export const int = (n: number): string => nf0.format(n)

export function savingPct(now: number, before: number): number {
  if (!before) return 0
  return Math.round(((before - now) / before) * 100)
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`
  return `${Math.floor(diff / 86400)} d`
}

export const priorityLabel = { 3: 'Alta', 2: 'Media', 1: 'Baja' } as const

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
