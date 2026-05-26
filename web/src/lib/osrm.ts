// OSRM client - uses public router.project-osrm.org by default.
// Caches /trip and /route responses in memory keyed by coord hash.

const OSRM_BASE = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

type Coord = { lat: number; lng: number };

const routeCache = new Map<string, RouteResult>();
const tripCache = new Map<string, TripResult>();

function coordsToPath(coords: Coord[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(";");
}

function cacheKey(coords: Coord[]): string {
  return coords.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join("|");
}

export type RouteResult = {
  distance: number; // meters
  duration: number; // seconds
  polyline: string; // polyline6 encoded
  geometry: [number, number][]; // [lat, lng]
};

export type TripResult = {
  // Optimal visit order (TSP). Indexes refer to input coords, including depot at index 0.
  waypointOrder: number[]; // length === coords.length
  distance: number;
  duration: number;
  polyline: string;
  geometry: [number, number][];
  legs: Array<{ distance: number; duration: number }>;
};

import polyline from "@mapbox/polyline";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": "OpenRoute2/0.1" } });
  if (!res.ok) {
    throw new Error(`OSRM ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

export async function osrmRoute(coords: Coord[]): Promise<RouteResult> {
  if (coords.length < 2) throw new Error("Need at least 2 coords for /route");
  const key = `r:${cacheKey(coords)}`;
  const cached = routeCache.get(key);
  if (cached) return cached;

  const path = coordsToPath(coords);
  const url = `${OSRM_BASE}/route/v1/driving/${path}?overview=full&geometries=polyline6&steps=false`;
  const data = (await fetchJson(url)) as {
    routes: Array<{ distance: number; duration: number; geometry: string }>;
  };
  const r = data.routes?.[0];
  if (!r) throw new Error("OSRM /route: no route returned");
  const decoded = polyline.decode(r.geometry, 6) as [number, number][];
  const out: RouteResult = {
    distance: r.distance,
    duration: r.duration,
    polyline: r.geometry,
    geometry: decoded,
  };
  routeCache.set(key, out);
  return out;
}

// /trip resolves TSP - returns optimal visit order.
// We fix the source at first coord (depot) and end open (roundtrip=false) by default.
export async function osrmTrip(
  coords: Coord[],
  opts: { roundtrip?: boolean } = {},
): Promise<TripResult> {
  if (coords.length < 2) throw new Error("Need at least 2 coords for /trip");
  const roundtrip = opts.roundtrip ?? false;
  const key = `t:${roundtrip}:${cacheKey(coords)}`;
  const cached = tripCache.get(key);
  if (cached) return cached;

  const path = coordsToPath(coords);
  const url = `${OSRM_BASE}/trip/v1/driving/${path}?source=first&roundtrip=${roundtrip ? "true" : "false"}&overview=full&geometries=polyline6&steps=false`;
  const data = (await fetchJson(url)) as {
    waypoints: Array<{ waypoint_index: number }>;
    trips: Array<{
      distance: number;
      duration: number;
      geometry: string;
      legs: Array<{ distance: number; duration: number }>;
    }>;
  };
  const t = data.trips?.[0];
  if (!t) throw new Error("OSRM /trip: no trip returned");
  // waypoint_index[i] = visit order of input coord i. Build inverse: order -> input index
  const waypointOrder: number[] = new Array(coords.length).fill(-1);
  data.waypoints.forEach((wp, inputIdx) => {
    waypointOrder[wp.waypoint_index] = inputIdx;
  });
  const decoded = polyline.decode(t.geometry, 6) as [number, number][];
  const out: TripResult = {
    waypointOrder,
    distance: t.distance,
    duration: t.duration,
    polyline: t.geometry,
    geometry: decoded,
    legs: t.legs,
  };
  tripCache.set(key, out);
  return out;
}
