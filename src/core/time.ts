// Horas «HH:MM» <-> minutos desde medianoche.

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`Hora no válida: «${hhmm}». Usa el formato HH:MM.`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`Hora no válida: «${hhmm}».`)
  return h * 60 + min
}

export function isTime(value: string): boolean {
  try {
    toMinutes(value)
    return true
  } catch {
    return false
  }
}

export function toHHMM(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** «2 h 05 min», «45 min». */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}
