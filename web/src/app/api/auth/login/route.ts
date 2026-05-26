import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser, setSessionCookie } from "@/lib/auth";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const session = await authenticateUser(parsed.data.username, parsed.data.password);
  if (!session) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }
  await setSessionCookie(session);
  return NextResponse.json({ user: session });
}
