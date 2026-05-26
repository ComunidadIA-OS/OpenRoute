"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { formatDate, formatTime } from "@/lib/format";
import { Search } from "lucide-react";

type OrderRow = {
  id: string;
  code: string;
  customer: { name: string };
  street: string;
  number: string;
  city: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  windowStart: string;
  windowEnd: string;
  plannedArrival: string | null;
  notes: string | null;
};

export function OrdersTable({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    return initialOrders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (q) {
        const needle = q.toLowerCase();
        const haystack = `${o.code} ${o.customer.name} ${o.street} ${o.number}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [initialOrders, q, status]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, cliente o calle..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="PENDING">Pendientes</SelectItem>
            <SelectItem value="DISPATCHED">Enviados</SelectItem>
            <SelectItem value="IN_TRANSIT">En tránsito</SelectItem>
            <SelectItem value="DELIVERED">Entregados</SelectItem>
            <SelectItem value="FAILED">Fallidos</SelectItem>
            <SelectItem value="RESCHEDULED">Reprogramados</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? "pedido" : "pedidos"}
        </p>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Franja</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay pedidos que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.code}</TableCell>
                <TableCell>{o.customer.name}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>
                      {o.street} {o.number}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {o.postalCode ? `${o.postalCode} · ` : ""}
                      {o.city}
                      {o.lat && o.lng ? " · ✓" : " · ✗ sin coords"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>
                  {formatTime(o.windowStart)} – {formatTime(o.windowEnd)}
                </TableCell>
                <TableCell>{formatDate(o.windowStart)}</TableCell>
                <TableCell>
                  {o.plannedArrival ? formatTime(o.plannedArrival) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
