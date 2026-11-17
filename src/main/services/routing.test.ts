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
