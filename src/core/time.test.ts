import { describe, expect, it } from 'vitest'
import { formatDuration, isTime, toHHMM, toMinutes } from './time'

describe('horas de reparto', () => {
  it('redondea los minutos y distingue medianoche de una duración acumulada', () => {
    expect(toHHMM(1439.6)).toBe('00:00')
    expect(formatDuration(1439.6)).toBe('24 h 00 min')
    expect(formatDuration(65.1)).toBe('1 h 05 min')
  })

  it('rechaza los minutos fuera de rango y el formato sin minutos completos', () => {
    expect(isTime('10:60')).toBe(false)
    expect(isTime('10:5')).toBe(false)
    expect(() => toMinutes('10:60')).toThrow('Hora no válida')
  })

  it('interpreta medianoche y una hora de un dígito', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes(' 9:05 ')).toBe(545)
  })
})
