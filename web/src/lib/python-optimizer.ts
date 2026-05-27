/**
 * Cliente HTTP del backend de optimización (FastAPI en :8000).
 *
 * Convierte los pedidos y vehículos del frontend al esquema que espera
 * `src/optimizer.py` (DataFrame con columnas id_pedido/lat/lon/peso_kg/...)
 * y llama al endpoint /compare, que devuelve baseline + plan optimizado +
 * cuadro de ahorros en una sola llamada.
 *
 * Para pintar la ruta en el mapa Leaflet, después de recibir el orden
 * óptimo del solver Python, llama a OSRM /route con ese orden y obtiene
 * la polyline real por calles. Así combinamos:
 *   - Calidad del solver (OR-Tools con time windows y capacidades).
 *   - Visualización fiel del frontend (polyline real, no rectas).
 */

import { osrmRoute } from "./osrm";
import { prisma } from "./prisma";

const OPTIMIZER_BASE_URL =
  process.env.OPTIMIZER_BASE_URL || "http://localhost:8000";
const DEPOT_LAT = parseFloat(process.env.DEPOT_LAT || "38.3460");
const DEPOT_LNG = parseFloat(process.env.DEPOT_LNG || "-0.4907");

// ─── Schemas de entrada (deben coincidir con app/main.py de FastAPI) ──

type PythonOrderIn = {
  id_pedido: string;
  cliente: string;
  lat: number;
  lon: number;
  prioridad: number; // 3=alta urgencia, 2=media, 1=baja (consistente con motor Python)
  peso_kg: number;
  franja_inicio: string; // HH:MM
  franja_fin: string; // HH:MM
  direccion?: string;
};

type PythonVehicleIn = {
  id_vehiculo: string;
  nombre: string;
  capacidad_kg: number;
  coste_por_km: number;
  hora_inicio: string;
  hora_fin: string;
  deposito_lat: number;
  deposito_lon: number;
  zona_preferente?: string;
};

// ─── Schemas de salida del backend ───────────────────────────────────

type PythonStop = {
  id_pedido: string;
  cliente: string;
  prioridad: number;
  peso_kg: number;
  hora_llegada: string;
  ventana: string;
  retrasado: boolean;
};

type PythonRoute = {
  id_vehiculo: string;
  nombre_vehiculo: string;
  distancia_km: number;
  coste_euros: number;
  co2_emissions_kg: number;
  carga_total_kg: number;
  detalle_paradas: PythonStop[];
};

type PythonDeferredOrder = {
  id_pedido: string;
  cliente: string;
  prioridad: number;
  peso_kg: number;
  ventana: string;
  motivo: string;
};

type PythonPlan = {
  tipo_planificacion: string;
  vehiculos_activos: number;
  distancia_total_km: number;
  tiempo_total_horas: number;
  coste_total_euros: number;
  co2_total_kg: number;
  pedidos_retrasados: number;
  incidentes_sobrecarga: number;
  rutas: PythonRoute[];
  /** Pedidos que OR-Tools no pudo encajar y dejó para replanificar (DISJUNCTIONS).
   * El chatbot debe avisarlos al usuario. Lista vacía si todo cupo. */
  pedidos_diferidos: PythonDeferredOrder[];
};

type PythonComparison = {
  ahorro_distancia_km: number;
  ahorro_distancia_pct: number;
  ahorro_coste_euros: number;
  ahorro_coste_pct: number;
  ahorro_co2_kg: number;
  retrasos_evitados: number;
  sobrecargas_evitadas: number;
};

export type PythonCompareResult = {
  baseline: PythonPlan;
  optimized: PythonPlan;
  savings: PythonComparison;
  /** True si OR-Tools no encontró solución factible y cayó a la heurística.
   * El consumidor (chatbot, UI) DEBE comprobarlo y advertir al usuario en lugar
   * de presentar el resultado como "optimizado por OR-Tools". */
  used_fallback: boolean;
  fallback_reason?: string | null;
};

// ─── Util ────────────────────────────────────────────────────────────

function toHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Comprueba que el servicio FastAPI está vivo. Cachea durante el proceso
 * para no martillear health en cada llamada.
 */
let _healthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_TTL_MS = 30_000;

export async function isPythonOptimizerUp(): Promise<boolean> {
  const now = Date.now();
  if (_healthCache && now - _healthCache.checkedAt < HEALTH_TTL_MS) {
    return _healthCache.ok;
  }
  try {
    const res = await fetch(`${OPTIMIZER_BASE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    const ok = res.ok;
    _healthCache = { ok, checkedAt: now };
    return ok;
  } catch {
    _healthCache = { ok: false, checkedAt: now };
    return false;
  }
}

/**
 * Carga los pedidos PENDING o DISPATCHED del día desde la DB del frontend
 * y los convierte al esquema que espera el optimizador Python.
 * Solo incluye pedidos con coordenadas válidas.
 */
async function loadOrdersForDate(date: Date): Promise<PythonOrderIn[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const orders = await prisma.order.findMany({
    where: {
      windowStart: { gte: start, lt: end },
      status: { in: ["PENDING", "DISPATCHED"] },
      lat: { not: null },
      lng: { not: null },
    },
    include: { customer: true },
    orderBy: { windowStart: "asc" },
  });

  return orders.map((o) => ({
    id_pedido: o.code,
    cliente: o.customer.name,
    lat: o.lat!,
    lon: o.lng!,
    // TODO(TRL5): añadir campo `priority` al modelo Order de Prisma y propagarlo.
    // Mientras tanto todos los pedidos llegan al solver con urgencia media, lo
    // que neutraliza el peso de la prioridad en el score. La promesa de
    // "OR-Tools con prioridades" se ve diluida hasta que el schema se amplíe.
    prioridad: 2,
    peso_kg: o.weightKg,
    franja_inicio: toHHMM(o.windowStart),
    franja_fin: toHHMM(o.windowEnd),
    direccion: `${o.street} ${o.number}`,
  }));
}

/**
 * Perfil operativo por matrícula: hasta que el modelo Vehicle de Prisma tenga
 * los campos `nombre` y `coste_por_km`, este mapper enriquece los datos de la
 * DB con los valores reales del JSON de flota. Importante: el motor mira la
 * subcadena "Electr" en `nombre` para aplicar el factor de CO₂ eléctrico
 * (40 g/km vs 250 g/km diésel) — sin esto, la métrica de huella de carbono
 * por vehículo no se diferencia. Plates definidos en prisma/seed.ts.
 */
const VEHICLE_PROFILES: Record<string, { nombre: string; coste_por_km: number; zona_preferente: string }> = {
  "1234-ABC": { nombre: "Furgoneta Eléctrica (Centro)", coste_por_km: 0.15, zona_preferente: "Centro" },
  "5678-DEF": { nombre: "Furgoneta Diésel (Playa)", coste_por_km: 0.35, zona_preferente: "Playa" },
  "9012-GHI": { nombre: "Furgoneta Diésel Apoyo (Norte)", coste_por_km: 0.22, zona_preferente: "Norte" },
};

/**
 * Carga las furgonetas disponibles desde la DB y las convierte al esquema
 * del optimizador Python. El depósito es el del frontend (DEPOT_LAT/LNG).
 */
async function loadAvailableVehicles(): Promise<PythonVehicleIn[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { available: true },
    orderBy: { plate: "asc" },
  });

  if (vehicles.length === 0) return [];

  return vehicles.map((v, idx) => {
    const profile = VEHICLE_PROFILES[v.plate] ?? {
      nombre: `Furgoneta ${v.plate}`,
      coste_por_km: 0.25,
      zona_preferente: idx === 0 ? "Centro" : idx === 1 ? "Playa" : "Norte",
    };
    return {
      id_vehiculo: v.plate,
      nombre: profile.nombre,
      capacidad_kg: v.capacityKg,
      coste_por_km: profile.coste_por_km,
      hora_inicio: "08:00",
      hora_fin: "18:00",
      deposito_lat: DEPOT_LAT,
      deposito_lon: DEPOT_LNG,
      zona_preferente: profile.zona_preferente,
    };
  });
}

/**
 * Llama al endpoint /compare del backend Python con los pedidos y vehículos
 * actuales. Devuelve los planes baseline y optimizado más el cuadro de
 * ahorros, o null si el servicio no está disponible o la llamada falla.
 */
export async function optimizeViaPython(
  date: Date,
  mode: "ortools" | "heuristic" = "ortools",
): Promise<PythonCompareResult | null> {
  const orders = await loadOrdersForDate(date);
  if (orders.length === 0) return null;

  const vehicles = await loadAvailableVehicles();
  if (vehicles.length === 0) return null;

  try {
    const res = await fetch(`${OPTIMIZER_BASE_URL}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders, vehicles, mode }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Python optimizer ${res.status}: ${detail}`);
      return null;
    }
    return (await res.json()) as PythonCompareResult;
  } catch (e) {
    console.error("optimizeViaPython failed", e);
    return null;
  }
}

/**
 * Tras recibir el plan del solver Python, calcula la polyline real por
 * calles para cada ruta usando OSRM. Devuelve un array de rutas listas
 * para pintar en el mapa Leaflet del frontend.
 */
export async function fetchPolylinesForPlan(plan: PythonPlan): Promise<
  Array<{
    vehicleId: string;
    polyline: string;
    geometry: [number, number][];
    distance: number;
    duration: number;
  }>
> {
  const out: Array<{
    vehicleId: string;
    polyline: string;
    geometry: [number, number][];
    distance: number;
    duration: number;
  }> = [];

  for (const ruta of plan.rutas) {
    if (ruta.detalle_paradas.length === 0) continue;

    // Recuperar lat/lon de cada parada cruzando con la DB por código de pedido.
    const codes = ruta.detalle_paradas.map((s) => s.id_pedido);
    const orders = await prisma.order.findMany({
      where: { code: { in: codes } },
      select: { code: true, lat: true, lng: true },
    });
    type OrderCoords = (typeof orders)[number];
    const byCode = new Map<string, OrderCoords>(
      orders.map((o: OrderCoords) => [o.code, o] as const),
    );

    const coords: { lat: number; lng: number }[] = [
      { lat: DEPOT_LAT, lng: DEPOT_LNG },
    ];
    for (const stop of ruta.detalle_paradas) {
      const o = byCode.get(stop.id_pedido);
      if (o?.lat && o?.lng) coords.push({ lat: o.lat, lng: o.lng });
    }

    if (coords.length < 2) continue;

    try {
      const route = await osrmRoute(coords);
      out.push({
        vehicleId: ruta.id_vehiculo,
        polyline: route.polyline,
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
      });
    } catch (e) {
      console.warn(`OSRM /route failed for vehicle ${ruta.id_vehiculo}`, e);
    }
  }

  return out;
}
