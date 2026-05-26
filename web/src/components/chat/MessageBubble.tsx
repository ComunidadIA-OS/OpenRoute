import { cn } from "@/lib/utils";
import { Bot, User, Wrench } from "lucide-react";

type Props = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
};

export function MessageBubble({ role, content, toolName }: Props) {
  if (role === "tool") {
    return <ToolMessage toolName={toolName || ""} content={content} />;
  }
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "rounded-full p-1.5 shrink-0",
          isUser ? "bg-slate-300 text-slate-700" : "bg-[#1a531a] text-white",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed",
          isUser
            ? "bg-[#1a531a] text-white"
            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100",
        )}
      >
        {content || (
          <span className="italic text-muted-foreground">…</span>
        )}
      </div>
    </div>
  );
}

function ToolMessage({ toolName, content }: { toolName: string; content: string }) {
  let parsed: { ok: boolean; data?: unknown; error?: string } | null = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // ignore
  }
  return (
    <div className="flex gap-3 items-start">
      <div className="rounded-full p-1.5 shrink-0 bg-amber-100 text-amber-800">
        <Wrench className="h-3 w-3" />
      </div>
      <details className="rounded-md border bg-amber-50 px-3 py-1.5 text-xs max-w-[80%]">
        <summary className="cursor-pointer text-amber-900 font-medium">
          🛠 {toolName} {parsed?.ok === false ? "· ❌" : parsed?.ok ? "· ✓" : ""}
        </summary>
        <pre className="mt-2 text-xs whitespace-pre-wrap break-words text-slate-700 max-h-60 overflow-auto">
          {parsed
            ? JSON.stringify(parsed.data || { error: parsed.error }, null, 2)
            : content}
        </pre>
      </details>
    </div>
  );
}
