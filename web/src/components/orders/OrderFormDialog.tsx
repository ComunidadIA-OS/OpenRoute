"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function OrderFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    street: "",
    number: "",
    postalCode: "",
    windowStart: "",
    windowEnd: "",
    weightKg: "5",
    notes: "",
  });

  function setField<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          street: form.street,
          number: form.number,
          postalCode: form.postalCode || undefined,
          windowStart: new Date(form.windowStart).toISOString(),
          windowEnd: new Date(form.windowEnd).toISOString(),
          weightKg: parseFloat(form.weightKg) || 5,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error creando pedido");
        return;
      }
      const data = await res.json();
      toast.success(
        `Pedido ${data.order.code} creado${data.geocoded ? " (geocodificado)" : " (sin geocodificar)"}`,
      );
      setOpen(false);
      setForm({
        customerName: "",
        street: "",
        number: "",
        postalCode: "",
        windowStart: "",
        windowEnd: "",
        weightKg: "5",
        notes: "",
      });
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setLoading(false);
    }
  }

  // Default windows = today 10:00-13:00
  function setDefaultsToday() {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(13, 0, 0, 0);
    setField("windowStart", toLocalInput(start));
    setField("windowEnd", toLocalInput(end));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button onClick={setDefaultsToday}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo pedido
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear nuevo pedido</DialogTitle>
          <DialogDescription>La dirección se geocodifica automáticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input value={form.customerName} onChange={(e) => setField("customerName", e.target.value)} placeholder="Carmen Pérez" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label>Calle</Label>
              <Input value={form.street} onChange={(e) => setField("street", e.target.value)} placeholder="Avenida de Maisonnave" />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={form.number} onChange={(e) => setField("number", e.target.value)} placeholder="12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Código postal</Label>
              <Input value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} placeholder="03003" />
            </div>
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input type="number" value={form.weightKg} onChange={(e) => setField("weightKg", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Franja inicio</Label>
              <Input type="datetime-local" value={form.windowStart} onChange={(e) => setField("windowStart", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Franja fin</Label>
              <Input type="datetime-local" value={form.windowEnd} onChange={(e) => setField("windowEnd", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={loading || !form.customerName || !form.street || !form.windowStart}>
            {loading ? "Creando..." : "Crear pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
