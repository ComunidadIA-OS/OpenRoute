// Thin wrapper over Ollama HTTP API (POST /api/chat) with tool calling.
// Avoids the official `ollama` package's Node-specific imports inside server routes.

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
};

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type OllamaChatResponse = {
  message: {
    role: "assistant";
    content: string;
    tool_calls?: ToolCall[];
  };
  done: boolean;
};

export async function ollamaChat(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  model?: string;
  temperature?: number;
}): Promise<OllamaChatResponse> {
  const body = {
    model: opts.model || OLLAMA_MODEL,
    messages: opts.messages,
    stream: false,
    // keep_alive 1h en lugar de 30m: en demos largas con pausas entre
    // preguntas, evita recargar el modelo en RAM (que es lo que cuesta
    // los primeros 30-60s tras inactividad).
    keep_alive: "1h",
    options: {
      temperature: opts.temperature ?? 0.2,
      // num_ctx reducido de 4096 a 2048: el modelo llama3.2:3b funciona
      // bien con 2K tokens de contexto, y a la mitad de tokens el tiempo
      // de inferencia en CPU baja casi proporcionalmente. La historia del
      // chat ya se trunca a 16 mensajes en runner.ts, así que 2048 es
      // suficiente para system_prompt + tools + últimos turnos.
      num_ctx: 2048,
    },
    ...(opts.tools && opts.tools.length ? { tools: opts.tools } : {}),
  };

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as OllamaChatResponse;
}
