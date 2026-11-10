// Flota y depósito de ejemplo (Elche). Los pedidos de ejemplo están en
// resources/samples/pedidos-alicante-elche.csv.

import type { Depot, Vehicle } from './types'

export const SAMPLE_DEPOT: Depot = {
  name: 'Depósito Elche',
  address: 'Elche, Alicante',
  lat: 38.2743,
  lng: -0.6865
}

export const SAMPLE_VEHICLES: Vehicle[] = [
  {
    id: 'VAN-01',
    name: 'Furgoneta eléctrica',
    capacityKg: 700,
    costPerKm: 0.15,
    electric: true,
    start: '07:00',
    end: '19:00',
    driver: 'Lucía',
    available: true
  },
  {
    id: 'VAN-02',
    name: 'Furgoneta diésel',
    capacityKg: 900,
    costPerKm: 0.35,
    electric: false,
    start: '07:00',
    end: '19:00',
    driver: 'Andrés',
    available: true
  },
  {
    id: 'VAN-03',
    name: 'Furgoneta de apoyo',
    capacityKg: 600,
    costPerKm: 0.22,
    electric: false,
    start: '07:00',
    end: '19:00',
    driver: 'Marta',
    available: true
  }
]
