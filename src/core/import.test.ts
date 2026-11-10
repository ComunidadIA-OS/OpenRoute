import { describe, expect, it } from 'vitest'
import { parseOrdersCsv, parseOrdersTable, parsePriority, parseTime } from './import'

describe('parseOrdersCsv', () => {
  it('entiende cabeceras en español con tildes y separador «;»', () => {
    const csv = [
      'Pedido;Cliente;Dirección;Población;Peso;Desde;Hasta;Prioridad',
      'A1;Bar Pepe;Calle Mayor 3;Elche;12,5;9:00;13h;alta'
    ].join('\n')
    const { orders, errors } = parseOrdersCsv(csv)
    expect(errors).toEqual([])
    expect(orders[0]).toMatchObject({
      id: 'A1',
      customer: 'Bar Pepe',
      address: 'Calle Mayor 3, Elche',
      weightKg: 12.5,
      windowStart: '09:00',
      windowEnd: '13:00',
      priority: 3
    })
  })

  it('acepta coordenadas y cabeceras en inglés', () => {
    const csv = 'order_id,customer,lat,lng,weight_kg\nX,Shop,38.3,-0.5,4'
    const { orders } = parseOrdersCsv(csv)
    expect(orders[0]).toMatchObject({ id: 'X', lat: 38.3, lng: -0.5, windowStart: '08:00', windowEnd: '20:00' })
  })

  it('informa de filas sin dirección y de franjas imposibles', () => {
    const csv = 'id,direccion,franja_inicio,franja_fin\n1,,9:00,10:00\n2,Calle 1,12:00,10:00\n3,Calle 2,,'
    const { orders, errors } = parseOrdersCsv(csv)
    expect(orders.map((o) => o.id)).toEqual(['3'])
    expect(errors.map((e) => e.row)).toEqual([2, 3])
  })

  it('renombra ids repetidos con un aviso', () => {
    const { orders, warnings } = parseOrdersCsv('id,direccion\nA,Calle 1\nA,Calle 2')
    expect(orders.map((o) => o.id)).toEqual(['A', 'A-3'])
    expect(warnings).toHaveLength(1)
  })

  it('pide una columna de dirección o coordenadas', () => {
    const { errors } = parseOrdersCsv('id,cliente\n1,Bar')
    expect(errors[0].message).toMatch(/dirección/)
  })
})

describe('parseOrdersTable', () => {
  it('convierte horas de Excel (fracción del día)', () => {
    const { orders } = parseOrdersTable([
      ['id', 'direccion', 'desde', 'hasta'],
      ['1', 'Calle 1', 0.375, 0.5]
    ])
    expect(orders[0]).toMatchObject({ windowStart: '09:00', windowEnd: '12:00' })
  })
})

describe('parsers', () => {
  it('prioridad', () => {
    expect(parsePriority('Alta')).toBe(3)
    expect(parsePriority('baja')).toBe(1)
    expect(parsePriority('')).toBe(2)
  })
  it('horas', () => {
    expect(parseTime('9')).toBe('09:00')
    expect(parseTime('9.30')).toBe('09:30')
    expect(parseTime('25:00')).toBeNull()
  })
})
