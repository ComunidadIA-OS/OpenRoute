import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildAddressQuery, geocode } from "@/lib/nominatim";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: ctx.params.id }, { code: ctx.params.id }] },
    include: { customer: true, routeStop: { include: { route: true } }, incidents: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order });
}

const patchSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  weightKg: z.number().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const current = await prisma.order.findFirst({
    where: { OR: [{ id: ctx.params.id }, { code: ctx.params.id }] },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (d.street) updates.street = d.street;
  if (d.number) updates.number = d.number;
  if (d.city) updates.city = d.city;
  if (d.postalCode !== undefined) updates.postalCode = d.postalCode;
  if (d.windowStart) updates.windowStart = new Date(d.windowStart);
  if (d.windowEnd) updates.windowEnd = new Date(d.windowEnd);
  if (d.status) updates.status = d.status;
  if (d.notes !== undefined) updates.notes = d.notes;
  if (d.weightKg !== undefined) updates.weightKg = d.weightKg;

  const addressChanged = d.street || d.number || d.city;
  if (addressChanged) {
    const street = d.street || current.street;
    const number = d.number || current.number;
    const city = d.city || current.city;
    const geo = await geocode(buildAddressQuery(street, number, city));
    if (geo) {
      updates.lat = geo.lat;
      updates.lng = geo.lng;
    }
  }

  const updated = await prisma.order.update({
    where: { id: current.id },
    data: updates,
    include: { customer: true },
  });
  return NextResponse.json({ order: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const current = await prisma.order.findFirst({
    where: { OR: [{ id: ctx.params.id }, { code: ctx.params.id }] },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.order.delete({ where: { id: current.id } });
  return NextResponse.json({ ok: true });
}
