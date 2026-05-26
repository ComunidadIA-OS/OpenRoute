"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, MapPin, Clock, Package, AlertTriangle, CheckCircle2, Truck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatTime,
  routeStatusLabel,
  stopStatusLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MapStop } from "@/components/map/RouteMap";

const RouteMap = dynamic(() => import("@/components/map/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-100 text-muted-foreground">
      Cargando mapa...
    </div>
  ),
});

type Stop = {
  id: string;
  sequence: number;
  status: string;
  etaPlanned: string;
  etaActual: string | null;
  order: {
    id: string;
    code: string;
    customer: { name: string };
    street: string;
    number: string;
    notes: string | null;
    lat: number | null;
    lng: number | null;
    windowStart: string;
    windowEnd: string;
  };
};

type Route = {
  id: string;
  code: string;
  date: string;
  status: string;
  startDepotLat: number;
  startDepotLng: number;
  totalDistance: number | null;
  totalDuration: number | null;
  polyline: string | null;
  driver: { fullName: string } | null;
  vehicle: { plate: string } | null;
  stops: Stop[];
};

const STOP_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  ARRIVED: "bg-blue-100 text-blue-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-amber-100 text-amber-700",
};

export function RouteDetailClient({ route: initialRoute }: { route: Route }) {
  const router = useRouter();
  const [route, setRoute] = useState(initialRoute);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const mapStops: MapStop[] = route.stops
    .filter((s) => s.order.lat && s.order.lng)
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      lat: s.order.lat!,
      lng: s.order.lng!,
      status: s.status,
      customer: s.order.customer.name,
      address: `${s.order.street} ${s.order.number}`,
      eta: s.etaPlanned,
    }));

  async function markDelivered(stopId: string) {
    const res = await fetch(`/api/routes/${route.id}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    if (!res.ok) {
      toast.error("Error marcando entregado");
      return;
    }
    toast.success("Parada marcada como entregada");
    setRoute((r) => ({
      ...r,
      stops: r.stops.map((s) =>
        s.id === stopId ? { ...s, status: "DELIVERED", etaActual: new Date().toISOString() } : s,
      ),
    }));
    router.refresh();
  }

  const delivered = route.stops.filter((s) => s.status === "DELIVERED").length;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-6 py-3 bg-white flex items-center gap-4">
        <Link href="/routes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Rutas
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{route.code}</h1>
          <p className="text-xs text-muted-foreground">
            {formatDate(route.date)} ·{" "}
            <Truck className="h-3 w-3 inline" /> {route.vehicle?.plate || "—"} ·{" "}
            {route.driver?.fullName || "—"}
          </p>
        </div>
        <Badge variant="outline">{routeStatusLabel(route.status)}</Badge>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Package className="h-4 w-4" />
            {delivered}/{route.stops.length}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {formatDistance(route.totalDistance || 0)}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {formatDuration(route.totalDuration || 0)}
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] overflow-hidden">
        <div className="bg-slate-50 relative">
          <RouteMap
            polyline={route.polyline}
            depot={{ lat: route.startDepotLat, lng: route.startDepotLng }}
            stops={mapStops}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
          />
        </div>

        <aside className="border-l bg-white overflow-auto">
          <div className="p-4 border-b bg-slate-50">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              {route.stops.length} paradas en orden óptimo
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Pulsa una parada para centrarla en el mapa
            </p>
          </div>
          <div className="divide-y">
            {route.stops.map((s) => {
              const isSelected = s.id === selectedStopId;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-slate-50 transition-colors",
                    isSelected && "bg-[#f0f9f0]",
                  )}
                  onClick={() => setSelectedStopId(s.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "rounded-full w-7 h-7 flex items-center justify-center text-xs font-semibold shrink-0",
                        s.status === "DELIVERED"
                          ? "bg-emerald-600 text-white"
                          : s.status === "FAILED" || s.status === "SKIPPED"
                            ? "bg-red-500 text-white"
                            : "bg-[#1a531a] text-white",
                      )}
                    >
                      {s.sequence}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{s.order.customer.name}</p>
                        <Badge variant="secondary" className={cn("text-xs", STOP_COLORS[s.status])}>
                          {stopStatusLabel(s.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {s.order.street} {s.order.number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {s.order.code}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="h-3 w-3" />
                          ETA {formatTime(s.etaPlanned)}
                        </span>
                        <span className="text-muted-foreground">
                          ({formatTime(s.order.windowStart)}-{formatTime(s.order.windowEnd)})
                        </span>
                      </div>
                      {s.order.notes && (
                        <p className="text-xs italic text-amber-700 mt-1 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {s.order.notes}
                        </p>
                      )}
                      {s.status === "PENDING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            markDelivered(s.id);
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Marcar entregada
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Card className="m-4 p-3">
            <h3 className="text-sm font-medium mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              ¿Algún problema?
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Reporta averías o incidencias desde el chatbot. Ej: &ldquo;Mi furgoneta se ha averiado, 45 minutos&rdquo;
            </p>
            <Link href="/chat">
              <Button variant="outline" size="sm" className="w-full">
                Ir al chatbot
              </Button>
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
