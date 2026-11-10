// Tipos del dominio. Todo lo que hay en src/core es TypeScript puro:
// no depende de Electron ni del navegador y se prueba con Vitest.

/** 3 = alta, 2 = media, 1 = baja. */
export type Priority = 1 | 2 | 3

export interface LatLng {
  lat: number
  lng: number
}

export interface Depot extends LatLng {
  name: string
  address?: string
}

export interface Vehicle {
  id: string
  name: string
  capacityKg: number
  costPerKm: number
  electric: boolean
  /** Inicio de jornada, «HH:MM». */
  start: string
  /** Fin de jornada, «HH:MM». El vehículo debe estar de vuelta en el depósito. */
  end: string
  driver?: string
  /** Si es false, no se usa al planificar (avería, baja, taller). */
  available: boolean
}

export interface Order {
  id: string
  customer: string
  address: string
  lat?: number
  lng?: number
  priority: Priority
  weightKg: number
  /** Ventana de entrega, «HH:MM». */
  windowStart: string
  windowEnd: string
  notes?: string
  /** Minutos de parada. Si falta, se usa el valor por defecto del plan. */
  serviceMin?: number
}

/** Pedido con coordenadas garantizadas. */
export type LocatedOrder = Order & LatLng

/**
 * Matriz de viaje. El índice 0 es el depósito y el i + 1 es el pedido i.
 * Distancias en metros y duraciones en segundos.
 */
export interface TravelMatrix {
  distanceM: number[][]
  durationS: number[][]
  source: 'osrm' | 'haversine'
}

export interface Stop {
  orderId: string
  /** Minutos desde medianoche. */
  arrival: number
  /** Espera hasta que abre la ventana. */
  waitMin: number
  departure: number
  late: boolean
  lateMin: number
}

export interface RouteMetrics {
  distanceKm: number
  durationMin: number
  loadKg: number
  costEur: number
  co2Kg: number
  lateStops: number
  overloaded: boolean
}

export interface Route extends RouteMetrics {
  vehicleId: string
  stops: Stop[]
  /** Minutos desde medianoche. */
  startMin: number
  endMin: number
  /** Trazado por calles [lng, lat] si el motor de rutas lo ha dado. */
  geometry?: [number, number][]
}

export interface PlanTotals {
  distanceKm: number
  durationMin: number
  costEur: number
  co2Kg: number
  lateStops: number
  vehiclesUsed: number
  overloadedRoutes: number
}

export interface Unassigned {
  orderId: string
  reason: string
}

export interface Plan {
  id: string
  createdAt: string
  status: 'draft' | 'approved'
  routes: Route[]
  unassigned: Unassigned[]
  totals: PlanTotals
  /** Plan manual de referencia (zonas + urgencia), para medir el ahorro. */
  baseline?: PlanTotals
  matrixSource: TravelMatrix['source']
  solveMs: number
  serviceMin: number
}
