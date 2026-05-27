"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageBubble } from "./MessageBubble";
import { Bot, Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type Msg = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
};

const SUGGESTIONS = [
  "Necesito rutas para hoy",
  "¿Qué pedidos hay pendientes?",
  "¿Cuántas rutas se han hecho hoy?",
  "Se me ha averiado la furgo, 45 minutos",
];

export function ChatWindow() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [lastRouteCode, setLastRouteCode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setLoading(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, role: "user", content },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, sessionId }),
      });
      if (!res.ok) {
        toast.error("Error de chat");
        return;
      }
      const data = await res.json();
      setSessionId(data.sessionId);
      // Replace messages by reloading from server response
      setMessages((prev) => {
        // Remove our temp user message (we'll add the persisted versions)
        const withoutTemp = prev.filter((m) => !m.id.startsWith("temp-"));
        return [
          ...withoutTemp,
          ...data.newMessages.map((m: Msg) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolName: m.toolName,
          })),
        ];
      });
      // Track route assignments / reschedules for quick link
      for (const hint of data.uiHints || []) {
        if (hint.kind === "route_assigned" || hint.kind === "route_rescheduled" || hint.kind === "route_link") {
          setLastRouteCode(hint.payload.routeCode);
        }
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-6 py-4 flex items-center justify-between bg-white">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#1a531a]" /> OpenRoute Assistant
          </h1>
          <p className="text-xs text-muted-foreground">
            Centro de comandos · LLM local con tool calling
          </p>
        </div>
        {lastRouteCode && (
          <Link
            href={`/routes`}
            className="text-sm bg-[#f0f9f0] hover:bg-[#d9eed9] text-[#1a531a] rounded-md px-3 py-1.5 font-medium"
          >
            Ver ruta {lastRouteCode} →
          </Link>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto p-6 space-y-4 bg-slate-50">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="rounded-full bg-[#d9eed9] p-3 inline-block mb-4">
              <Sparkles className="h-6 w-6 text-[#1a531a]" />
            </div>
            <h2 className="text-xl font-semibold mb-2">¿En qué puedo ayudarte?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Soy tu copiloto. Puedo consultar pedidos, sugerir rutas optimizadas,
              gestionar averías y mucho más.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-lg mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-md border bg-white px-3 py-2 hover:border-[#1a531a] hover:bg-[#f0f9f0] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} toolName={m.toolName} />
        ))}

        {loading && (
          <div className="flex gap-3 items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Pensando...</span>
          </div>
        )}
      </div>

      <div className="border-t bg-white p-4">
        <div className="max-w-4xl mx-auto flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Pregunta lo que necesites... (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            className="resize-none"
            disabled={loading}
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} size="lg">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
