import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const route = await prisma.route.findFirst({
    where: { OR: [{ id: ctx.params.id }, { code: ctx.params.id }] },
    include: {
      driver: { select: { id: true, username: true, fullName: true } },
      vehicle: true,
      stops: {
        include: { order: { include: { customer: true } } },
        orderBy: { sequence: "asc" },
      },
      incidents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ route });
}
