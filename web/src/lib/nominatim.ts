import { prisma } from "./prisma";

const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";

let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const gap = 1100; // Nominatim policy: ≤1 req/s
  if (now - lastCall < gap) {
    await new Promise((r) => setTimeout(r, gap - (now - lastCall)));
  }
  lastCall = Date.now();
}

export type GeocodeResult = { lat: number; lng: number; cached: boolean };

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const cached = await prisma.geocodeCache.findUnique({ where: { query } });
  if (cached) return { lat: cached.lat, lng: cached.lng, cached: true };

  await throttle();
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OpenRoute2/0.1 (hackathon)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    await prisma.geocodeCache.create({
      data: { query, lat, lng, raw: JSON.stringify(data[0]) },
    });
    return { lat, lng, cached: false };
  } catch {
    return null;
  }
}

export function buildAddressQuery(
  street: string,
  number: string,
  city: string = "Alicante",
): string {
  return `${street} ${number}, ${city}, España`;
}
