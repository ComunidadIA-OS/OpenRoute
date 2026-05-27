import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RouteDetailClient } from "@/components/routes/RouteDetailClient";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({ params }: { params: { id: string } }) {
  const route = await prisma.route.findFirst({
    where: { OR: [{ id: params.id }, { code: params.id }] },
    include: {
      driver: { select: { id: true, fullName: true, username: true } },
      vehicle: { select: { id: true, plate: true } },
      stops: {
        include: { order: { include: { customer: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!route) notFound();

  const serialized = {
    id: route.id,
    code: route.code,
    date: route.date.toISOString(),
    status: route.status,
    startDepotLat: route.startDepotLat,
    startDepotLng: route.startDepotLng,
    totalDistance: route.totalDistance,
    totalDuration: route.totalDuration,
    polyline: route.polyline,
    driver: route.driver ? { fullName: route.driver.fullName } : null,
    vehicle: route.vehicle ? { plate: route.vehicle.plate } : null,
    stops: route.stops.map((s: (typeof route.stops)[number]) => ({
      id: s.id,
      sequence: s.sequence,
      status: s.status,
      etaPlanned: s.etaPlanned.toISOString(),
      etaActual: s.etaActual ? s.etaActual.toISOString() : null,
      order: {
        id: s.order.id,
        code: s.order.code,
        customer: { name: s.order.customer.name },
        street: s.order.street,
        number: s.order.number,
        notes: s.order.notes,
        lat: s.order.lat,
        lng: s.order.lng,
        windowStart: s.order.windowStart.toISOString(),
        windowEnd: s.order.windowEnd.toISOString(),
      },
    })),
  };

  return <RouteDetailClient route={serialized} />;
}
