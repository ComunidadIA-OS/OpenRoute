import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const schema = z.object({
  type: z.enum(["VEHICLE_BREAKDOWN", "UNDELIVERABLE", "TRAFFIC", "CUSTOMER_ABSENT", "OTHER"]),
  description: z.string().min(1),
  durationMin: z.number().nullable().optional(),
  orderId: z.string().nullable().optional(),
  routeId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });

  const inc = await prisma.incident.create({
    data: {
      type: parsed.data.type,
      description: parsed.data.description,
      durationMin: parsed.data.durationMin ?? null,
      orderId: parsed.data.orderId ?? null,
      routeId: parsed.data.routeId ?? null,
      reportedById: session.userId,
      status: "OPEN",
    },
  });
  return NextResponse.json({ incident: inc });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const incidents = await prisma.incident.findMany({
    where: status ? { status } : {},
    include: { order: true, route: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ incidents });
}
