// llama3.1:8b sometimes emits tool calls as inline JSON text instead of using the
// structured tool_calls API field. This parser detects those patterns and converts
// them into synthetic ToolCall objects so the runner can still execute them.

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

// Match {"name": "tool", "parameters": {...}} or {"name": "tool", "arguments": {...}}
// Also matches the variant {"function": {"name": "tool", "arguments": {...}}}
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

  // Form 1: { name, parameters }
  // Form 2: { name, arguments }
  // Form 3: { function: { name, arguments } }
  let name: string | undefined;
  let args: Record<string, unknown> | undefined;
  if (typeof p.name === "string") {
    name = p.name;
    if (p.parameters && typeof p.parameters === "object") args = p.parameters as Record<string, unknown>;
    else if (p.arguments && typeof p.arguments === "object") args = p.arguments as Record<string, unknown>;
    else args = {};
  } else if (p.function && typeof p.function === "object") {
    const f = p.function as Record<string, unknown>;
    if (typeof f.name === "string") {
      name = f.name;
      args = (f.arguments as Record<string, unknown>) || {};
    }
  }

  if (!name || !KNOWN_TOOLS.has(name)) return null;
  return {
    id: `inline_${Math.random().toString(36).slice(2, 10)}`,
    function: { name, arguments: args || {} },
  };
}
