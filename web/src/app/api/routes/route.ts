import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { osrmRoute } from "@/lib/osrm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const driverId = searchParams.get("driverId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (driverId) where.driverId = driverId;
  if (status) where.status = status;
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.date = { gte: start, lt: end };
  }

  const routes = await prisma.route.findMany({
    where,
    include: {
      driver: { select: { id: true, username: true, fullName: true } },
      vehicle: { select: { id: true, plate: true } },
      stops: {
        include: { order: { include: { customer: true } } },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: { date: "desc" },
    take: 200,
  });
  return NextResponse.json({ routes });
}

const stopSchema = z.object({
  orderId: z.string(),
  sequence: z.number(),
  etaPlanned: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const createSchema = z.object({
  date: z.string(),
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  startDepotLat: z.number(),
  startDepotLng: z.number(),
  totalDistance: z.number().optional(),
  totalDuration: z.number().optional(),
  polyline: z.string().optional(),
  stops: z.array(stopSchema),
  label: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  // Generate route code
  const date = new Date(d.date);
  const dateStr = date.toISOString().slice(0, 10);
  const count = await prisma.route.count({
    where: { code: { startsWith: `RT-${dateStr}-` } },
  });
  const code = `RT-${dateStr}-${String.fromCharCode(65 + count)}`; // A, B, C...

  // If polyline not provided, fetch one via OSRM from the stops.
  let polyline = d.polyline;
  let totalDistance = d.totalDistance ?? 0;
  let totalDuration = d.totalDuration ?? 0;
  if (!polyline) {
    try {
      const path = [
        { lat: d.startDepotLat, lng: d.startDepotLng },
        ...d.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      ];
      const r = await osrmRoute(path);
      polyline = r.polyline;
      totalDistance = r.distance;
      totalDuration = r.duration;
    } catch (e) {
      console.warn("osrm route for new Route failed", e);
    }
  }

  const route = await prisma.route.create({
    data: {
      code,
      date,
      driverId: d.driverId ?? null,
      vehicleId: d.vehicleId ?? null,
      status: "PLANNED",
      startDepotLat: d.startDepotLat,
      startDepotLng: d.startDepotLng,
      totalDistance,
      totalDuration,
      polyline,
      stops: {
        create: d.stops.map((s) => ({
          orderId: s.orderId,
          sequence: s.sequence,
          etaPlanned: new Date(s.etaPlanned),
        })),
      },
    },
    include: {
      driver: true,
      vehicle: true,
      stops: { include: { order: true }, orderBy: { sequence: "asc" } },
    },
  });

  // Update orders status -> DISPATCHED and planned arrival
  await Promise.all(
    d.stops.map((s) =>
      prisma.order.update({
        where: { id: s.orderId },
        data: { status: "DISPATCHED", plannedArrival: new Date(s.etaPlanned) },
      }),
    ),
  );
  // Mark vehicle as not available
  if (d.vehicleId) {
    await prisma.vehicle.update({ where: { id: d.vehicleId }, data: { available: false } });
  }

  return NextResponse.json({ route });
}
