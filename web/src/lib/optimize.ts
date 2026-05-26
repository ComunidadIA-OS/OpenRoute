// Route optimization using OSRM /trip (TSP solver) + sector filtering.
// Generates 2-3 alternative routes for the chatbot to propose.

import { osrmTrip, osrmRoute, type TripResult } from "./osrm";
import { prisma } from "./prisma";

const DEPOT_LAT = parseFloat(process.env.DEPOT_LAT || "38.3460");
const DEPOT_LNG = parseFloat(process.env.DEPOT_LNG || "-0.4907");
const SERVICE_TIME_SEC = 180;
const SHIFT_START_HOUR = 9; // 09:00 default depot departure

export type SectorFilter = "all" | "centro" | "playa" | "norte";

export type OptimizedStop = {
  orderId: string;
  code: string;
  customerName: string;
  street: string;
  number: string;
  district?: string;
  lat: number;
  lng: number;
  sequence: number;
  etaPlanned: Date;
  windowStart: Date;
  windowEnd: Date;
  withinWindow: boolean;
  weightKg: number;
};

export type RouteOption = {
  optionId: string;
  label: string;
  sector: SectorFilter;
  stopCount: number;
  totalDistance: number; // meters
  totalDuration: number; // seconds (driving + service)
  drivingDuration: number;
  serviceDuration: number;
  polyline: string;
  geometry: [number, number][];
  stops: OptimizedStop[];
  startAt: Date;
  endAt: Date;
  totalWeightKg: number;
};

// Coarse sector classification by district keywords or lat/lng.
function classifyByCoords(lat: number, lng: number): SectorFilter {
  // Playa San Juan + Albufereta
  if (lat >= 38.367 && lng >= -0.448) return "playa";
  // Garbinet/San Blas (north-west)
  if (lat >= 38.378 || (lat >= 38.353 && lng <= -0.494)) return "norte";
  return "centro";
}

function depotDepartureForDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(SHIFT_START_HOUR, 0, 0, 0);
  return d;
}

// Pick orders for a given sector + date. windowStart on that day, status PENDING.
async function pickOrders(date: Date, sector: SectorFilter, maxStops = 12) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const all = await prisma.order.findMany({
    where: {
      windowStart: { gte: start, lt: end },
      status: { in: ["PENDING", "DISPATCHED"] },
      lat: { not: null },
      lng: { not: null },
    },
    include: { customer: true },
    orderBy: { windowStart: "asc" },
  });

  const filtered = all.filter((o) => {
    if (sector === "all") return true;
    return classifyByCoords(o.lat!, o.lng!) === sector;
  });

  return filtered.slice(0, maxStops);
}

export async function optimizeOption(
  date: Date,
  sector: SectorFilter,
  optionId: string,
  label: string,
  maxStops = 12,
): Promise<RouteOption | null> {
  const orders = await pickOrders(date, sector, maxStops);
  if (orders.length === 0) return null;

  const depot = { lat: DEPOT_LAT, lng: DEPOT_LNG };
  const coords = [depot, ...orders.map((o) => ({ lat: o.lat!, lng: o.lng! }))];

  let trip: TripResult;
  try {
    trip = await osrmTrip(coords, { roundtrip: false });
  } catch (e) {
    console.error("OSRM trip failed", e);
    return null;
  }

  // Compose visit order: trip.waypointOrder[k] is the input index visited at step k.
  // The first one is depot (input index 0). Then each subsequent is one of the orders.
  const visitOrder = trip.waypointOrder.slice(1); // skip depot
  const orderedStops = visitOrder.map((inputIdx, i) => {
    const order = orders[inputIdx - 1];
    return { order, legIndex: i };
  });

  const startAt = depotDepartureForDate(date);
  let cursor = new Date(startAt);
  let totalDist = 0;
  let totalDriving = 0;

  const stops: OptimizedStop[] = [];
  for (let i = 0; i < orderedStops.length; i++) {
    const { order } = orderedStops[i];
    const leg = trip.legs[i]; // leg i is from waypoint i to i+1
    if (leg) {
      cursor = new Date(cursor.getTime() + leg.duration * 1000);
      totalDist += leg.distance;
      totalDriving += leg.duration;
    }
    const eta = new Date(cursor);
    const within = eta >= order.windowStart && eta <= order.windowEnd;
    stops.push({
      orderId: order.id,
      code: order.code,
      customerName: order.customer.name,
      street: order.street,
      number: order.number,
      lat: order.lat!,
      lng: order.lng!,
      sequence: i + 1,
      etaPlanned: eta,
      windowStart: order.windowStart,
      windowEnd: order.windowEnd,
      withinWindow: within,
      weightKg: order.weightKg,
    });
    cursor = new Date(cursor.getTime() + SERVICE_TIME_SEC * 1000);
  }

  const totalService = stops.length * SERVICE_TIME_SEC;
  return {
    optionId,
    label,
    sector,
    stopCount: stops.length,
    totalDistance: totalDist,
    totalDuration: totalDriving + totalService,
    drivingDuration: totalDriving,
    serviceDuration: totalService,
    polyline: trip.polyline,
    geometry: trip.geometry,
    stops,
    startAt,
    endAt: cursor,
    totalWeightKg: stops.reduce((a, s) => a + s.weightKg, 0),
  };
}

export async function suggestRoutes(date: Date, maxStops = 10): Promise<RouteOption[]> {
  // Generate up to 3 options: Centro, Playa, All (truncated)
  const options: RouteOption[] = [];
  const centro = await optimizeOption(date, "centro", "A", "Ruta Centro", maxStops);
  if (centro) options.push(centro);
  const playa = await optimizeOption(date, "playa", "B", "Ruta Playa San Juan", maxStops);
  if (playa) options.push(playa);
  const all = await optimizeOption(date, "all", "C", "Ruta Completa (todos los sectores)", 14);
  if (all) options.push(all);
  return options;
}

// Re-optimize a route after a vehicle breakdown.
// Returns: new ordered stops for remaining (non-delivered) + deferred order ids.
export async function rescheduleRoute(
  routeId: string,
  delayMinutes: number,
): Promise<{
  remaining: OptimizedStop[];
  deferredOrderIds: string[];
  polyline: string;
  geometry: [number, number][];
  totalDistance: number;
  totalDuration: number;
  newStartAt: Date;
}> {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      stops: {
        include: { order: { include: { customer: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!route) throw new Error("Route not found");

  // Determine starting position: last delivered stop, else depot.
  const completed = route.stops.filter((s) => s.status === "DELIVERED");
  const pending = route.stops.filter((s) => s.status === "PENDING" || s.status === "ARRIVED");

  if (pending.length === 0) {
    return {
      remaining: [],
      deferredOrderIds: [],
      polyline: "",
      geometry: [],
      totalDistance: 0,
      totalDuration: 0,
      newStartAt: new Date(),
    };
  }

  const lastCompleted = completed[completed.length - 1];
  const startCoord = lastCompleted
    ? { lat: lastCompleted.order.lat!, lng: lastCompleted.order.lng! }
    : { lat: route.startDepotLat, lng: route.startDepotLng };

  // New start time = now + delay (assume breakdown is "now").
  const newStartAt = new Date(Date.now() + delayMinutes * 60_000);

  // Get coords for pending stops.
  const pendingOrders = pending.map((s) => s.order);
  const coords = [
    startCoord,
    ...pendingOrders.map((o) => ({ lat: o.lat!, lng: o.lng! })),
  ];

  const trip = await osrmTrip(coords, { roundtrip: false });
  const visitOrder = trip.waypointOrder.slice(1);

  let cursor = new Date(newStartAt);
  let totalDist = 0;
  let totalDriving = 0;
  const remaining: OptimizedStop[] = [];
  const deferred: string[] = [];

  for (let i = 0; i < visitOrder.length; i++) {
    const inputIdx = visitOrder[i];
    const order = pendingOrders[inputIdx - 1];
    const leg = trip.legs[i];
    if (leg) {
      cursor = new Date(cursor.getTime() + leg.duration * 1000);
      totalDist += leg.distance;
      totalDriving += leg.duration;
    }
    const eta = new Date(cursor);
    // If ETA past windowEnd, defer.
    if (eta > order.windowEnd) {
      deferred.push(order.id);
      continue;
    }
    const within = eta >= order.windowStart && eta <= order.windowEnd;
    remaining.push({
      orderId: order.id,
      code: order.code,
      customerName: order.customer.name,
      street: order.street,
      number: order.number,
      lat: order.lat!,
      lng: order.lng!,
      sequence: remaining.length + 1,
      etaPlanned: eta,
      windowStart: order.windowStart,
      windowEnd: order.windowEnd,
      withinWindow: within,
      weightKg: order.weightKg,
    });
    cursor = new Date(cursor.getTime() + SERVICE_TIME_SEC * 1000);
  }

  return {
    remaining,
    deferredOrderIds: deferred,
    polyline: trip.polyline,
    geometry: trip.geometry,
    totalDistance: totalDist,
    totalDuration: totalDriving + remaining.length * SERVICE_TIME_SEC,
    newStartAt,
  };
}
