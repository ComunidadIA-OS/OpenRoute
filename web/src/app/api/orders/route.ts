import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildAddressQuery, geocode } from "@/lib/nominatim";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const q = searchParams.get("q");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { street: { contains: q } },
      { customer: { name: { contains: q } } },
    ];
  }
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.windowStart = { gte: start, lt: end };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, routeStop: { include: { route: true } } },
    orderBy: [{ windowStart: "asc" }, { code: "asc" }],
    take: 500,
  });
  return NextResponse.json({ orders });
}

const createSchema = z.object({
  customerName: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
  city: z.string().default("Alicante"),
  postalCode: z.string().optional(),
  weightKg: z.coerce.number().optional(),
  volume: z.coerce.number().optional(),
  windowStart: z.string(),
  windowEnd: z.string(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  // Geocode (best-effort)
  const geo = await geocode(buildAddressQuery(d.street, d.number, d.city));

  // Generate code
  const year = new Date().getFullYear();
  const count = await prisma.order.count({
    where: { code: { startsWith: `ORD-${year}-` } },
  });
  const code = `ORD-${year}-${(1100 + count + 1).toString().padStart(5, "0")}`;

  // Find or create customer (simple name match)
  let customer = await prisma.customer.findFirst({ where: { name: d.customerName } });
  if (!customer) {
    customer = await prisma.customer.create({ data: { name: d.customerName } });
  }

  const order = await prisma.order.create({
    data: {
      code,
      customerId: customer.id,
      street: d.street,
      number: d.number,
      city: d.city,
      postalCode: d.postalCode,
      weightKg: d.weightKg ?? 5,
      volume: d.volume ?? 0.1,
      windowStart: new Date(d.windowStart),
      windowEnd: new Date(d.windowEnd),
      notes: d.notes,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    },
    include: { customer: true },
  });
  return NextResponse.json({ order, geocoded: !!geo });
}
