import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const availableOnly = searchParams.get("available") === "true";
  const vehicles = await prisma.vehicle.findMany({
    where: availableOnly ? { available: true } : {},
    include: { driver: true },
    orderBy: { plate: "asc" },
  });
  return NextResponse.json({ vehicles });
}
