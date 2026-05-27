import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { runChat } from "@/lib/chat/runner";

const schema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid", issues: parsed.error.issues }, { status: 400 });

  // Resolve or create session
  let sessionId: string | undefined = parsed.data.sessionId;
  if (sessionId) {
    const exists = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!exists || exists.userId !== session.userId) sessionId = undefined;
  }
  if (!sessionId) {
    const created = await prisma.chatSession.create({
      data: { userId: session.userId, title: parsed.data.message.slice(0, 50) },
    });
    sessionId = created.id;
  }
  // After the block above, sessionId is guaranteed to be a string.
  const finalSessionId: string = sessionId as string;

  const result = await runChat(finalSessionId, parsed.data.message, {
    sessionId: finalSessionId,
    userId: session.userId,
    userRole: session.role,
    username: session.username,
  });

  return NextResponse.json({
    sessionId: finalSessionId,
    finalText: result.finalText,
    newMessages: result.newMessages,
    uiHints: result.uiHints,
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    // List sessions
    const sessions = await prisma.chatSession.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ sessions });
  }
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chatSession || chatSession.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ session: chatSession });
}
