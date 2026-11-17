import { describe, expect, it } from 'vitest'
import { toMinutes } from './time'

describe('horas de reparto', () => {
  it('interpreta medianoche y una hora de un dígito', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes(' 9:05 ')).toBe(545)
  })
})
