import { describe, expect, it, vi } from 'vitest'
import { haversineMatrix } from '../../core/geo'
import { fetchJson } from './http'
import { travelMatrix } from './routing'

vi.mock('./http', () => ({ fetchJson: vi.fn() }))

const points = [
  { lat: 38.3, lng: -0.5 },
  { lat: 38.4, lng: -0.5 }
]
const server = 'https://rutas.example'

describe('travelMatrix', () => {
  it('combina bloques de hasta cien coordenadas conservando la dirección de cada par', async () => {
    vi.mocked(fetchJson).mockClear()
    const muchosPuntos = Array.from({ length: 101 }, (_, i) => ({ lat: 38, lng: i }))
    vi.mocked(fetchJson).mockImplementation(async <T>(address: string): Promise<T> => {
      const url = new URL(address)
      const coordenadas = url.pathname
        .split('/')
        .at(-1)!
        .split(';')
        .map((pair) => Number(pair.split(',')[0]))
      expect(coordenadas.length).toBeLessThanOrEqual(100)
      const indices = (key: string) => url.searchParams.get(key)!.split(';').map(Number)
      const matriz = indices('sources').map((i) =>
        indices('destinations').map((j) => coordenadas[i] * 1000 + coordenadas[j])
      )
      return { code: 'Ok', distances: matriz, durations: matriz } as T
    })
    try {
      const matriz = await travelMatrix(server, muchosPuntos)
      expect(matriz.source).toBe('osrm')
      expect(matriz.distanceM[85][22]).toBe(85022)
      expect(matriz.distanceM[22][85]).toBe(22085)
      expect(matriz.distanceM[0][100]).toBe(100)
      expect(fetchJson).toHaveBeenCalledTimes(9)
    } finally {
      vi.mocked(fetchJson).mockReset()
    }
  })

  it('usa la estimación local sin hacer peticiones cuando la URL está vacía', async () => {
    vi.mocked(fetchJson).mockClear()
    expect(await travelMatrix('', points)).toEqual(haversineMatrix(points))
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('identifica las distancias y duraciones completas de OSRM, aunque falte la diagonal', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      code: 'Ok',
      distances: [
        [null, 1100],
        [1200, null]
      ],
      durations: [
        [null, 130],
        [140, null]
      ]
    })

    expect(await travelMatrix(server, points)).toEqual({
      distanceM: [
        [0, 1100],
        [1200, 0]
      ],
      durationS: [
        [0, 130],
        [140, 0]
      ],
      source: 'osrm'
    })
  })

  it('conserva los pares disponibles y estima distancia y duración si falta uno de los datos', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      code: 'Ok',
      distances: [
        [0, 1100],
        [1200, 0]
      ],
      durations: [
        [0, 130],
        [null, 0]
      ]
    })

    const fallback = haversineMatrix(points)
    expect(await travelMatrix(server, points)).toEqual({
      distanceM: [[0, 1100], [...fallback.distanceM[1]]],
      durationS: [[0, 130], [...fallback.durationS[1]]],
      source: 'mixed'
    })
  })

  it('identifica una matriz estimada cuando la tabla no tiene pares válidos', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      code: 'Ok',
      distances: [
        [0, null],
        [-1, 0]
      ],
      durations: [
        [0, null],
        [100, 0]
      ]
    })

    expect(await travelMatrix(server, points)).toEqual(haversineMatrix(points))
  })

  it('estima la matriz completa cuando falla OSRM', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('OSRM no responde'))

    expect(await travelMatrix(server, points)).toEqual(haversineMatrix(points))
  })
})
