import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    include: { vehicle: true },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      vehicle: u.vehicle ? { id: u.vehicle.id, plate: u.vehicle.plate } : null,
    })),
  });
}
