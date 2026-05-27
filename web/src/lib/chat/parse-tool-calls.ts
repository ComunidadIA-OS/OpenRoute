// Los modelos pequeños de Llama (3.2:1b sobre todo) y a veces los grandes
// (3.1:8b) emiten tool calls como JSON en línea dentro del campo `content`
// en lugar de usar el campo estructurado `tool_calls` del protocolo de
// Ollama. Este parser detecta esos patrones y los convierte en ToolCall
// sintéticos para que el runner los pueda ejecutar.
//
// Schemas vistos en el campo:
//   1. { "name": "tool",     "parameters": {...} }              ← estándar Llama
//   2. { "name": "tool",     "arguments": {...} }               ← variante OpenAI
//   3. { "function": { "name": "tool", "arguments": {...} } }   ← estructura OpenAI
//   4. { "function": "tool", "parameters": {...} }              ← llama3.2:1b (string!)
//   5. { "function": "tool", "arguments": {...} }               ← variante de 4
//   6. { "tool": "tool",     "arguments": {...} }               ← alias menos común
//   7. { "tool_name": "tool", "args": {...} }                    ← otro alias

import type { ToolCall } from "../ollama-client";

const KNOWN_TOOLS = new Set([
  "current_time",
  "list_orders",
  "get_order",
  "update_order",
  "list_vehicles",
  "list_drivers",
  "suggest_routes",
  "optimize_with_ortools",
  "assign_route",
  "list_routes",
  "get_route",
  "report_incident",
  "reschedule_route",
  "mark_stop_delivered",
]);
export function parseInlineToolCalls(text: string): { toolCalls: ToolCall[]; remaining: string } {
  const toolCalls: ToolCall[] = [];
  if (!text) return { toolCalls, remaining: "" };

  let remaining = text;
  // Strategy: scan for JSON-like blocks containing "name": "<known tool>"
  // To avoid greedy regex pitfalls, use a brace-balanced scan starting at "{".
  const seen = new Set<string>();
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i] !== "{") continue;
    // Brace-balanced extraction
    let depth = 0;
    let end = -1;
    let inString = false;
    let escape = false;
    for (let j = i; j < remaining.length; j++) {
      const c = remaining[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    const slice = remaining.slice(i, end + 1);
    if (seen.has(slice)) continue;
    seen.add(slice);

    const tc = tryParseAsToolCall(slice);
    if (tc) {
      toolCalls.push(tc);
      // Remove the matched JSON from remaining text
      remaining = remaining.slice(0, i) + remaining.slice(end + 1);
      i = i - 1; // restart scan from before this position
    }
  }

  return { toolCalls, remaining: remaining.trim() };
}

function tryParseAsToolCall(jsonText: string): ToolCall | null {
  // Repair common llama3.1 mistakes:
  // - unquoted variable references like  "date": current_time  ->  "date": "current_time"
  //   We replace any bare identifier appearing after a colon with a string.
  // This is heuristic but safer than executing arbitrary expressions.
  let repaired = jsonText;
  repaired = repaired.replace(/:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(,|})/g, (_m, ident, tail) => {
    if (ident === "true" || ident === "false" || ident === "null") {
      return `: ${ident}${tail}`;
    }
    if (/^\d+$/.test(ident)) {
      return `: ${ident}${tail}`;
    }
    return `: "${ident}"${tail}`;
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  // Aceptamos los 7 schemas más comunes que sueltan Llama 3.1 y 3.2 cuando
  // emiten el tool call inline en lugar de en el campo estructurado.
  let name: string | undefined;
  let args: Record<string, unknown> | undefined;

  // Form 1 / 2: { name: "tool", parameters/arguments: {...} }
  if (typeof p.name === "string") {
    name = p.name;
    args = extractArgs(p);
  }
  // Form 4 / 5: { function: "tool", parameters/arguments: {...} } ← llama3.2:1b
  else if (typeof p.function === "string") {
    name = p.function;
    args = extractArgs(p);
  }
  // Form 3: { function: { name: "tool", arguments: {...} } }
  else if (p.function && typeof p.function === "object") {
    const f = p.function as Record<string, unknown>;
    if (typeof f.name === "string") {
      name = f.name;
      args = extractArgs(f);
    }
  }
  // Form 6: { tool: "tool", arguments: {...} }
  else if (typeof p.tool === "string") {
    name = p.tool;
    args = extractArgs(p);
  }
  // Form 7: { tool_name: "tool", args: {...} }
  else if (typeof p.tool_name === "string") {
    name = p.tool_name;
    args = extractArgs(p);
  }

  if (!name || !KNOWN_TOOLS.has(name)) return null;
  return {
    id: `inline_${Math.random().toString(36).slice(2, 10)}`,
    function: { name, arguments: args || {} },
  };
}

/**
 * Extrae los argumentos del tool call probando los keys más comunes en orden
 * de probabilidad. Si vienen como string (algunos modelos los meten como
 * JSON serializado), intenta parsearlos.
 */
function extractArgs(obj: Record<string, unknown>): Record<string, unknown> {
  const candidates = ["arguments", "parameters", "args", "params", "input"] as const;
  for (const key of candidates) {
    const v = obj[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    if (typeof v === "string" && v.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // ignore — seguimos probando otras keys
      }
    }
  }
  return {};
}
