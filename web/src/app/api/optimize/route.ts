import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { suggestRoutes } from "@/lib/optimize";

const schema = z.object({
  date: z.string().optional(), // YYYY-MM-DD; defaults to today
  maxStops: z.coerce.number().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });
  }
  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  date.setHours(0, 0, 0, 0);

  try {
    const options = await suggestRoutes(date, parsed.data.maxStops ?? 10);
    return NextResponse.json({ options, date: date.toISOString() });
  } catch (e) {
    console.error("optimize error", e);
    return NextResponse.json(
      { error: "Optimization failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
