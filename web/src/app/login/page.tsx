"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, MapPin, Package, User, Lock, AlertCircle, Sparkles } from "lucide-react";

// Inner component that consumes useSearchParams. Required because Next.js 14
// needs CSR bailouts wrapped in <Suspense> for static export to succeed.
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/orders";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoUsers, setShowDemoUsers] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error de inicio de sesión" }));
        setError(data.error || "Error de inicio de sesión");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(u: string, p: string) {
    setUsername(u);
    setPassword(p);
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Bienvenido de vuelta</h2>
        <p className="text-sm text-slate-600">
          Inicia sesión para acceder al centro de control de tu flota.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium text-slate-700">
            Usuario
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              id="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="pl-10 h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            Contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pl-10 h-11"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-[#1a531a] hover:bg-[#134013] text-white font-medium text-base shadow-sm"
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <button
          type="button"
          onClick={() => setShowDemoUsers((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#1a531a] transition-colors w-full text-left"
        >
          <Sparkles className="h-4 w-4 text-[#1a531a]" />
          {showDemoUsers ? "Ocultar" : "Ver"} usuarios de demostración
        </button>

        {showDemoUsers && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-600 mb-2">
              Haz click en uno para rellenar el formulario automáticamente:
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              <DemoUser onClick={() => fillDemo("admin", "admin123")} label="admin" role="Administrador" />
              <DemoUser onClick={() => fillDemo("despacho", "despacho123")} label="despacho" role="Despachador" />
              <DemoUser onClick={() => fillDemo("juan", "juan123")} label="juan" role="Conductor · 1234-ABC" />
              <DemoUser onClick={() => fillDemo("maria", "maria123")} label="maria" role="Conductora · 5678-DEF" />
              <DemoUser onClick={() => fillDemo("carlos", "carlos123")} label="carlos" role="Conductor · 9012-GHI" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DemoUser({ onClick, label, role }: { onClick: () => void; label: string; role: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-md bg-white border border-slate-200 px-3 py-1.5 text-sm hover:border-[#1a531a] hover:bg-[#f0f9f0] transition-colors text-left"
    >
      <span className="font-mono font-medium text-slate-900">{label}</span>
      <span className="text-xs text-slate-500">{role}</span>
    </button>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Lado izquierdo: branding (oculto en móviles) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0d2f0d] via-[#1a531a] to-[#134013] relative overflow-hidden">
        {/* Patrón decorativo sutil */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />

        <div className="relative flex flex-col justify-between p-12 text-white w-full">
          {/* Logo + nombre */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2 ring-1 ring-white/20">
              <Image src="/logo-white.svg" alt="OpenRoute" width={44} height={44} priority />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">OpenRoute</h1>
              <p className="text-sm text-white/70">Gestión inteligente de reparto</p>
            </div>
          </div>

          {/* Mensaje central */}
          <div className="space-y-6">
            <h2 className="text-4xl font-bold leading-tight">
              Tu flota,
              <br />
              <span className="text-emerald-300">optimizada</span> con IA local.
            </h2>
            <p className="text-lg text-white/80 leading-relaxed max-w-md">
              OpenRoute transforma decenas de pedidos diarios en rutas óptimas
              y explicables. Sin caja negra. Sin enviar datos fuera.
            </p>

            <ul className="space-y-3 text-white/90">
              <Feature icon={Bot} text="Chatbot LLM local como centro de comandos" />
              <Feature icon={MapPin} text="Optimización VRP con OR-Tools y OSRM" />
              <Feature icon={Package} text="Auto-gestión de averías e incidencias" />
            </ul>
          </div>

          {/* Footer */}
          <div className="text-xs text-white/60">@IlicitIA</div>
        </div>
      </div>

      {/* Lado derecho: formulario */}
      <div className="flex-1 lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16 bg-white">
        {/* Logo móvil (visible cuando se oculta el panel izquierdo) */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-2">
          <div className="rounded-lg bg-[#1a531a] p-1.5">
            <Image src="/logo-white.svg" alt="OpenRoute" width={24} height={24} priority />
          </div>
          <span className="font-bold text-[#1a531a]">OpenRoute</span>
        </div>

        <Suspense fallback={<div className="text-slate-500">Cargando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <div className="rounded-md bg-white/10 p-1.5">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm">{text}</span>
    </li>
  );
}
