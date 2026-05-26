"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Package, MessageSquare, Route, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  user: { username: string; fullName: string; role: string };
};

const NAV = [
  { href: "/orders", label: "Pedidos", icon: Package },
  { href: "/chat", label: "Chatbot", icon: MessageSquare },
  { href: "/routes", label: "Rutas", icon: Route },
];

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r bg-slate-50 dark:bg-slate-900 flex flex-col h-full">
      <div className="px-5 py-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-white p-1 ring-1 ring-[#1a531a]/20">
            <Image src="/logo.svg" alt="OpenRoute" width={32} height={32} priority />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-none text-[#1a531a]">OpenRoute</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Centro de control</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[#1a531a] text-white"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="px-3 py-2 mb-2">
          <p className="text-sm font-medium leading-none">{user.fullName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {user.username} · {user.role === "ADMIN" ? "Admin" : "Conductor"}
          </p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
