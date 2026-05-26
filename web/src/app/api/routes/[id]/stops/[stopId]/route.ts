import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const patchSchema = z.object({
  status: z.enum(["PENDING", "ARRIVED", "DELIVERED", "FAILED", "SKIPPED"]),
  etaActual: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string; stopId: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const stop = await prisma.routeStop.findUnique({ where: { id: ctx.params.stopId } });
  if (!stop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.routeStop.update({
    where: { id: ctx.params.stopId },
    data: {
      status: parsed.data.status,
      etaActual: parsed.data.status === "DELIVERED" ? (parsed.data.etaActual ? new Date(parsed.data.etaActual) : new Date()) : undefined,
    },
  });

  // Cascade to Order status
  const orderStatus =
    parsed.data.status === "DELIVERED"
      ? "DELIVERED"
      : parsed.data.status === "FAILED"
        ? "FAILED"
        : parsed.data.status === "ARRIVED"
          ? "IN_TRANSIT"
          : undefined;
  if (orderStatus) {
    await prisma.order.update({ where: { id: stop.orderId }, data: { status: orderStatus } });
  }

  return NextResponse.json({ stop: updated });
}
