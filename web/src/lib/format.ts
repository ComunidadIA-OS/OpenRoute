export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

export function formatDistance(m: number): string {
  if (!m) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function orderStatusLabel(s: string): string {
  return (
    {
      PENDING: "Pendiente",
      DISPATCHED: "Enviado",
      IN_TRANSIT: "En tránsito",
      DELIVERED: "Entregado",
      FAILED: "Fallido",
      RESCHEDULED: "Reprogramado",
    } as Record<string, string>
  )[s] || s;
}

export function routeStatusLabel(s: string): string {
  return (
    {
      PLANNED: "Planificada",
      ACTIVE: "Activa",
      COMPLETED: "Completada",
      CANCELLED: "Cancelada",
    } as Record<string, string>
  )[s] || s;
}

export function stopStatusLabel(s: string): string {
  return (
    {
      PENDING: "Pendiente",
      ARRIVED: "En sitio",
      DELIVERED: "Entregado",
      FAILED: "Fallido",
      SKIPPED: "Omitido",
    } as Record<string, string>
  )[s] || s;
}
