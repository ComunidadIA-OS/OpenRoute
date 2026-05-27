import { prisma } from "../prisma";
import { ollamaChat, type ChatMessage } from "../ollama-client";
import { TOOLS } from "./tools";
import { TOOL_HANDLERS, type ToolContext } from "./tool-handlers";
import { SYSTEM_PROMPT } from "./system-prompt";
import { parseInlineToolCalls } from "./parse-tool-calls";

// MAX_ITERATIONS reducido de 5 a 3 para acotar el peor caso de latencia en
// CPU: una iteración con llama3.2:3b cuesta 30-90s en Docker Desktop sin GPU,
// así que 5 iteraciones encadenadas dejaban al usuario "Pensando..." varios
// minutos. 3 iteraciones cubre el patrón típico: current_time → tool de
// acción → respuesta final.
const MAX_ITERATIONS = 3;
const MAX_HISTORY = 16; // Trim older messages to keep prompt small (antes 24).

export type RunResult = {
  finalText: string;
  newMessages: Array<{
    id: string;
    role: string;
    content: string;
    toolName?: string;
    toolCalls?: string;
    createdAt: Date;
  }>;
  uiHints: Array<{ kind: string; payload: unknown }>;
};

function buildMessages(
  historyRows: Array<{ role: string; content: string; toolCalls?: string | null; toolCallId?: string | null; toolName?: string | null }>,
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const r of historyRows) {
    if (r.role === "tool") {
      out.push({ role: "tool", content: r.content, tool_name: r.toolName || undefined });
    } else if (r.role === "assistant") {
      const m: ChatMessage = { role: "assistant", content: r.content };
      if (r.toolCalls) {
        try {
          m.tool_calls = JSON.parse(r.toolCalls);
        } catch {
          // ignore malformed
        }
      }
      out.push(m);
    } else if (r.role === "user") {
      out.push({ role: "user", content: r.content });
    }
  }
  return out;
}

export async function runChat(
  sessionId: string,
  userMessage: string,
  ctx: ToolContext,
): Promise<RunResult> {
  // 1. Load history
  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY,
  });

  // 2. Persist user message
  const userRow = await prisma.chatMessage.create({
    data: { sessionId, role: "user", content: userMessage },
  });

  const newMessages: RunResult["newMessages"] = [
    {
      id: userRow.id,
      role: "user",
      content: userMessage,
      createdAt: userRow.createdAt,
    },
  ];
  const uiHints: RunResult["uiHints"] = [];

  // 3. Build conversation
  const messages = buildMessages([
    ...history,
    { role: "user", content: userMessage },
  ]);

  // 4. Tool-calling loop
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let response;
    try {
      response = await ollamaChat({ messages, tools: TOOLS });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Error desconocido en Ollama";
      const row = await prisma.chatMessage.create({
        data: { sessionId, role: "assistant", content: `[Error conectando con el modelo: ${errMsg}]` },
      });
      newMessages.push({ id: row.id, role: "assistant", content: row.content, createdAt: row.createdAt });
      return { finalText: row.content, newMessages, uiHints };
    }
    const msg = response.message;

    // If no structured tool_calls, try to parse inline JSON tool calls from the text.
    let effectiveToolCalls = msg.tool_calls;
    let effectiveContent = msg.content || "";
    if (!effectiveToolCalls || effectiveToolCalls.length === 0) {
      const inline = parseInlineToolCalls(effectiveContent);
      if (inline.toolCalls.length > 0) {
        effectiveToolCalls = inline.toolCalls;
        effectiveContent = inline.remaining;
      }
    }

    // If still no tool calls → final assistant message
    if (!effectiveToolCalls || effectiveToolCalls.length === 0) {
      const text = effectiveContent || "(sin respuesta)";
      const row = await prisma.chatMessage.create({
        data: { sessionId, role: "assistant", content: text },
      });
      newMessages.push({ id: row.id, role: "assistant", content: text, createdAt: row.createdAt });
      messages.push({ role: "assistant", content: text });
      return { finalText: text, newMessages, uiHints };
    }

    // Persist assistant message with tool_calls
    const assistantRow = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: effectiveContent,
        toolCalls: JSON.stringify(effectiveToolCalls),
      },
    });
    newMessages.push({
      id: assistantRow.id,
      role: "assistant",
      content: effectiveContent,
      toolCalls: JSON.stringify(effectiveToolCalls),
      createdAt: assistantRow.createdAt,
    });
    messages.push({
      role: "assistant",
      content: effectiveContent,
      tool_calls: effectiveToolCalls,
    });

    // Execute each tool call
    for (const call of effectiveToolCalls) {
      const name = call.function?.name;
      let args = call.function?.arguments;
      // Sometimes llama returns arguments as a JSON string
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      args = (args || {}) as Record<string, unknown>;

      const handler = TOOL_HANDLERS[name];
      let result;
      if (!handler) {
        result = {
          ok: false,
          error: `Tool '${name}' no existe. Tools disponibles: ${Object.keys(TOOL_HANDLERS).join(", ")}`,
        };
      } else {
        try {
          result = await handler(args, ctx);
        } catch (e) {
          result = {
            ok: false,
            error: `Error ejecutando ${name}: ${e instanceof Error ? e.message : "desconocido"}`,
          };
        }
      }

      if (result.uiHint) uiHints.push(result.uiHint);
      const toolContent = JSON.stringify({
        ok: result.ok,
        data: result.data,
        error: result.error,
      });
      const toolRow = await prisma.chatMessage.create({
        data: {
          sessionId,
          role: "tool",
          content: toolContent,
          toolName: name,
        },
      });
      newMessages.push({
        id: toolRow.id,
        role: "tool",
        content: toolContent,
        toolName: name,
        createdAt: toolRow.createdAt,
      });
      messages.push({ role: "tool", content: toolContent, tool_name: name });
    }
  }

  // Iterations exhausted
  const text = "He alcanzado el límite de pasos para esta respuesta. Por favor reformula tu petición o divídela en pasos más simples.";
  const row = await prisma.chatMessage.create({
    data: { sessionId, role: "assistant", content: text },
  });
  newMessages.push({ id: row.id, role: "assistant", content: text, createdAt: row.createdAt });
  return { finalText: text, newMessages, uiHints };
}
