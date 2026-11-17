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

  it('busca otro sufijo si el id generado ya existe', () => {
    const { orders, warnings } = parseOrdersCsv('id,direccion\nA,Calle 1\nA-4,Calle 2\nA,Calle 3')
    expect(orders.map((o) => o.id)).toEqual(['A', 'A-4', 'A-4-2'])
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

  it('lee las horas con formato de Excel en UTC sin aplicar la zona del ordenador', () => {
    const inicio = new Date('1899-12-30T09:15:00.000Z')
    const fin = new Date('1899-12-30T12:45:00.000Z')
    const { orders } = parseOrdersTable([
      ['id', 'direccion', 'desde', 'hasta'],
      ['1', 'Calle 1', inicio, fin]
    ])
    expect(orders[0]).toMatchObject({ windowStart: '09:15', windowEnd: '12:45' })
  })

  it('conserva la primera columna cuando una cabecera está repetida', () => {
    const { orders } = parseOrdersTable([
      ['id', 'dirección', 'dirección'],
      ['1', 'Calle 1', 'Calle 2'],
      ['2', 'Calle 3', null]
    ])
    expect(orders.map((o) => o.address)).toEqual(['Calle 1', 'Calle 3'])
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
    expect(parseTime('9:30:99')).toBeNull()
    expect(parseTime(new Date(NaN))).toBeNull()
    expect(parseTime(0.99999)).toBe('23:59')
    expect(parseTime(24)).toBeNull()
    expect(parseTime('24')).toBeNull()
  })
})
