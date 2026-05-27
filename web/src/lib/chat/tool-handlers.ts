// Implementations of each tool. Each handler returns a JSON-serializable result
// summary (LLM doesn't need full DB objects - we condense to relevant fields).

import { prisma } from "../prisma";
import { suggestRoutes, rescheduleRoute, type RouteOption } from "../optimize";
import { optimizeViaPython, isPythonOptimizerUp } from "../python-optimizer";

const DEPOT_LAT = parseFloat(process.env.DEPOT_LAT || "38.3460");
const DEPOT_LNG = parseFloat(process.env.DEPOT_LNG || "-0.4907");

// Per-session in-memory cache of last suggest_routes options. Keyed by sessionId.
// Needed because the LLM only sees compact summaries, not full geometries.
const lastSuggestions = new Map<string, { date: Date; options: RouteOption[] }>();

export type ToolContext = {
  sessionId: string;
  userId: string;
  userRole: "ADMIN" | "DRIVER";
  username: string;
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  uiHint?: { kind: string; payload: unknown }; // For UI to render a card
};

// llama3.1:8b a veces envuelve los argumentos numéricos como strings.
// Esta función coerciona de forma segura, devolviendo undefined si no se puede.
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Aceptar tanto "20" como "20 minutos" extrayendo el primer número.
    const match = trimmed.match(/-?\d+(?:[.,]\d+)?/);
    if (!match) return undefined;
    const n = parseFloat(match[0].replace(",", "."));
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

function fmtTime(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("es-ES");
}
function fmtDur(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}
function fmtKm(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export const TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
> = {
  current_time: async () => {
    const now = new Date();
    return {
      ok: true,
      data: {
        nowIso: now.toISOString(),
        today: now.toISOString().slice(0, 10),
        weekday: now.toLocaleDateString("es-ES", { weekday: "long" }),
        timezone: "Europe/Madrid",
      },
    };
  },

  list_orders: async (args) => {
    const status = args.status as string | undefined;
    const rawDate = args.date as string | undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (rawDate) {
      let start: Date;
      if (rawDate === "hoy" || rawDate === "today") start = new Date();
      else if (rawDate === "mañana" || rawDate === "tomorrow") {
        start = new Date();
        start.setDate(start.getDate() + 1);
      } else if (rawDate === "ayer" || rawDate === "yesterday") {
        start = new Date();
        start.setDate(start.getDate() - 1);
      } else {
        start = new Date(rawDate);
      }
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.windowStart = { gte: start, lt: end };
      }
    }
    const total = await prisma.order.count({ where });
    const orders = await prisma.order.findMany({
      where,
      include: { customer: true },
      orderBy: { windowStart: "asc" },
      take: 10,
    });
    return {
      ok: true,
      data: {
        total,
        showing: orders.length,
        items: orders.map((o) => ({
          code: o.code,
          customer: o.customer.name,
          address: `${o.street} ${o.number}`,
          status: o.status,
          window: `${fmtTime(o.windowStart)}-${fmtTime(o.windowEnd)} (${fmtDate(o.windowStart)})`,
          plannedArrival: o.plannedArrival ? fmtTime(o.plannedArrival) : null,
        })),
      },
    };
  },

  get_order: async (args) => {
    const code = args.code as string;
    if (!code) return { ok: false, error: "Falta el código del pedido" };
    const order = await prisma.order.findFirst({
      where: { OR: [{ code }, { id: code }] },
      include: { customer: true, routeStop: { include: { route: true } }, incidents: true },
    });
    if (!order) return { ok: false, error: `No se encontró el pedido ${code}` };
    return {
      ok: true,
      data: {
        code: order.code,
        customer: order.customer.name,
        address: `${order.street} ${order.number}, ${order.city}`,
        coords: order.lat && order.lng ? { lat: order.lat, lng: order.lng } : null,
        status: order.status,
        window: `${fmtTime(order.windowStart)}-${fmtTime(order.windowEnd)}`,
        date: fmtDate(order.windowStart),
        plannedArrival: order.plannedArrival ? fmtTime(order.plannedArrival) : null,
        weightKg: order.weightKg,
        notes: order.notes,
        route: order.routeStop?.route
          ? {
              code: order.routeStop.route.code,
              sequence: order.routeStop.sequence,
              status: order.routeStop.status,
            }
          : null,
        incidentsCount: order.incidents.length,
      },
    };
  },

  update_order: async (args) => {
    const code = args.code as string;
    if (!code) return { ok: false, error: "Falta código" };
    const current = await prisma.order.findFirst({
      where: { OR: [{ code }, { id: code }] },
    });
    if (!current) return { ok: false, error: `Pedido ${code} no existe` };

    const updates: Record<string, unknown> = {};
    if (args.street) updates.street = args.street;
    if (args.number) updates.number = args.number;
    if (args.windowStart) updates.windowStart = new Date(args.windowStart as string);
    if (args.windowEnd) updates.windowEnd = new Date(args.windowEnd as string);
    if (args.notes !== undefined) updates.notes = args.notes;

    if (args.street || args.number) {
      const { geocode, buildAddressQuery } = await import("../nominatim");
      const street = (args.street as string) || current.street;
      const number = (args.number as string) || current.number;
      const geo = await geocode(buildAddressQuery(street, number, current.city));
      if (geo) {
        updates.lat = geo.lat;
        updates.lng = geo.lng;
      }
    }

    const updated = await prisma.order.update({ where: { id: current.id }, data: updates });
    return {
      ok: true,
      data: {
        code: updated.code,
        status: updated.status,
        address: `${updated.street} ${updated.number}`,
        window: `${fmtTime(updated.windowStart)}-${fmtTime(updated.windowEnd)}`,
        message: `Pedido ${updated.code} actualizado.`,
      },
    };
  },

  list_vehicles: async (args) => {
    const availableOnly = args.availableOnly === true;
    const vehicles = await prisma.vehicle.findMany({
      where: availableOnly ? { available: true } : {},
      include: { driver: true },
    });
    return {
      ok: true,
      data: {
        total: vehicles.length,
        items: vehicles.map((v) => ({
          plate: v.plate,
          capacityKg: v.capacityKg,
          available: v.available,
          driver: v.driver?.username || null,
        })),
      },
    };
  },

  list_drivers: async () => {
    const drivers = await prisma.user.findMany({
      where: { role: "DRIVER" },
      include: { vehicle: true },
    });
    return {
      ok: true,
      data: {
        items: drivers.map((d) => ({
          username: d.username,
          fullName: d.fullName,
          vehicle: d.vehicle?.plate || null,
        })),
      },
    };
  },

  suggest_routes: async (args, ctx) => {
    const rawDate = args.date as string | undefined;
    let date: Date;
    if (!rawDate || rawDate === "hoy" || rawDate === "today") {
      date = new Date();
    } else if (rawDate === "mañana" || rawDate === "tomorrow") {
      date = new Date();
      date.setDate(date.getDate() + 1);
    } else if (rawDate === "ayer" || rawDate === "yesterday") {
      date = new Date();
      date.setDate(date.getDate() - 1);
    } else {
      date = new Date(rawDate);
      if (isNaN(date.getTime())) date = new Date();
    }
    date.setHours(0, 0, 0, 0);
    const maxStops = toNumber(args.maxStops) ?? 10;

    const options = await suggestRoutes(date, maxStops);
    const dateOut = date.toISOString().slice(0, 10);
    if (!options.length) {
      return {
        ok: false,
        error: `No hay pedidos pendientes para ${dateOut}, no se pueden sugerir rutas.`,
      };
    }
    // Cache for assign_route
    lastSuggestions.set(ctx.sessionId, { date, options });

    return {
      ok: true,
      data: {
        date: dateOut,
        options: options.map((o) => ({
          optionId: o.optionId,
          label: o.label,
          sector: o.sector,
          stops: o.stopCount,
          distance: fmtKm(o.totalDistance),
          duration: fmtDur(o.totalDuration),
          startAt: fmtTime(o.startAt),
          endAt: fmtTime(o.endAt),
          totalWeightKg: Math.round(o.totalWeightKg * 10) / 10,
          firstStops: o.stops.slice(0, 3).map((s) => `${s.code} (${s.street} ${s.number})`),
          allWithinWindows: o.stops.every((s) => s.withinWindow),
        })),
      },
      uiHint: { kind: "route_options", payload: { options, date: date.toISOString() } },
    };
  },

  assign_route: async (args, ctx) => {
    const optionId = (args.optionId as string)?.toUpperCase();
    const driverUsername = args.driverUsername as string;
    if (!optionId || !driverUsername) {
      return { ok: false, error: "Faltan optionId o driverUsername" };
    }
    const cached = lastSuggestions.get(ctx.sessionId);
    if (!cached) {
      return {
        ok: false,
        error: "Primero pide sugerencias de rutas con suggest_routes.",
      };
    }
    const opt = cached.options.find((o) => o.optionId === optionId);
    if (!opt) {
      return {
        ok: false,
        error: `Opción ${optionId} no existe. Opciones disponibles: ${cached.options.map((o) => o.optionId).join(", ")}`,
      };
    }
    const driver = await prisma.user.findUnique({
      where: { username: driverUsername },
      include: { vehicle: true },
    });
    if (!driver) return { ok: false, error: `Conductor '${driverUsername}' no existe.` };
    if (driver.role !== "DRIVER") return { ok: false, error: `${driverUsername} no es un conductor.` };
    if (!driver.vehicle) return { ok: false, error: `${driverUsername} no tiene furgoneta asignada.` };

    // Create route
    const dateStr = cached.date.toISOString().slice(0, 10);
    const count = await prisma.route.count({
      where: { code: { startsWith: `RT-${dateStr}-` } },
    });
    const code = `RT-${dateStr}-${String.fromCharCode(65 + count)}`;

    const route = await prisma.route.create({
      data: {
        code,
        date: cached.date,
        driverId: driver.id,
        vehicleId: driver.vehicle.id,
        status: "PLANNED",
        startDepotLat: DEPOT_LAT,
        startDepotLng: DEPOT_LNG,
        totalDistance: opt.totalDistance,
        totalDuration: opt.totalDuration,
        polyline: opt.polyline,
        stops: {
          create: opt.stops.map((s) => ({
            orderId: s.orderId,
            sequence: s.sequence,
            etaPlanned: s.etaPlanned,
          })),
        },
      },
    });

    // Update orders + vehicle availability
    await prisma.$transaction([
      ...opt.stops.map((s) =>
        prisma.order.update({
          where: { id: s.orderId },
          data: { status: "DISPATCHED", plannedArrival: s.etaPlanned },
        }),
      ),
      prisma.vehicle.update({ where: { id: driver.vehicle.id }, data: { available: false } }),
    ]);

    return {
      ok: true,
      data: {
        routeCode: route.code,
        driver: driver.fullName,
        vehicle: driver.vehicle.plate,
        stops: opt.stopCount,
        distance: fmtKm(opt.totalDistance),
        duration: fmtDur(opt.totalDuration),
        message: `Ruta ${route.code} creada y asignada a ${driver.fullName} con furgoneta ${driver.vehicle.plate}.`,
      },
      uiHint: { kind: "route_assigned", payload: { routeId: route.id, routeCode: route.code } },
    };
  },

  optimize_with_ortools: async (args) => {
    const rawDate = args.date as string | undefined;
    let date: Date;
    if (!rawDate || rawDate === "hoy" || rawDate === "today") {
      date = new Date();
    } else if (rawDate === "mañana" || rawDate === "tomorrow") {
      date = new Date();
      date.setDate(date.getDate() + 1);
    } else {
      date = new Date(rawDate);
      if (isNaN(date.getTime())) date = new Date();
    }
    date.setHours(0, 0, 0, 0);
    const mode = (args.mode as "ortools" | "heuristic" | undefined) ?? "ortools";

    if (!(await isPythonOptimizerUp())) {
      return {
        ok: false,
        error:
          "El backend de optimización Python (FastAPI :8000) no está accesible. Arráncalo con `uvicorn app.main:app --port 8000` desde la raíz del repo, o usa suggest_routes que utiliza el motor TSP integrado del frontend.",
      };
    }

    const result = await optimizeViaPython(date, mode);
    if (!result) {
      return {
        ok: false,
        error: `No se pudo optimizar para ${date.toISOString().slice(0, 10)}. Verifica que hay pedidos PENDING/DISPATCHED y furgonetas disponibles para esa fecha.`,
      };
    }

    const { baseline, optimized, savings } = result;

    // IA RESPONSABLE: si OR-Tools no encontró solución factible, el motor cayó
    // a la heurística. El bot DEBE avisar al usuario antes de presentar el
    // resultado como "optimizado por OR-Tools". Idem con los pedidos que las
    // DISJUNCTIONS descartaron por infactibilidad — son operativamente críticos.
    const usedFallback = Boolean(result.used_fallback);
    const fallbackReason = result.fallback_reason ?? null;
    const pedidosDiferidos = (optimized.pedidos_diferidos ?? []).map((d) => ({
      id_pedido: d.id_pedido,
      cliente: d.cliente,
      peso_kg: Math.round(d.peso_kg * 10) / 10,
      ventana: d.ventana,
      motivo: d.motivo,
    }));

    return {
      ok: true,
      data: {
        date: date.toISOString().slice(0, 10),
        motor: optimized.tipo_planificacion,
        used_fallback: usedFallback,
        fallback_reason: fallbackReason,
        aviso_motor: usedFallback
          ? "OR-Tools no encontró solución factible con las restricciones actuales; el plan mostrado proviene de la heurística de respaldo. NO presentes este resultado como 'optimizado con OR-Tools'."
          : null,
        pedidos_diferidos: pedidosDiferidos,
        aviso_diferidos: pedidosDiferidos.length > 0
          ? `Hay ${pedidosDiferidos.length} pedido(s) que no caben en la jornada con la flota actual. Avísale al usuario y propón replanificarlos a mañana.`
          : null,
        plan: {
          vehiculos_activos: optimized.vehiculos_activos,
          distancia_km: Math.round(optimized.distancia_total_km * 10) / 10,
          tiempo_horas: Math.round(optimized.tiempo_total_horas * 10) / 10,
          coste_euros: Math.round(optimized.coste_total_euros * 100) / 100,
          co2_kg: Math.round(optimized.co2_total_kg * 10) / 10,
          pedidos_retrasados: optimized.pedidos_retrasados,
          incidentes_sobrecarga: optimized.incidentes_sobrecarga,
          rutas: optimized.rutas.map((r) => ({
            vehiculo: r.id_vehiculo,
            nombre: r.nombre_vehiculo,
            paradas: r.detalle_paradas.length,
            distancia_km: Math.round(r.distancia_km * 10) / 10,
            coste_euros: Math.round(r.coste_euros * 100) / 100,
            carga_kg: Math.round(r.carga_total_kg * 10) / 10,
            primeras_paradas: r.detalle_paradas.slice(0, 3).map((s) => `${s.id_pedido} (${s.cliente}) a las ${s.hora_llegada}`),
          })),
        },
        impacto_vs_plan_manual: {
          ahorro_km: Math.round(savings.ahorro_distancia_km * 10) / 10,
          ahorro_km_pct: Math.round(savings.ahorro_distancia_pct * 10) / 10,
          ahorro_euros: Math.round(savings.ahorro_coste_euros * 100) / 100,
          ahorro_euros_pct: Math.round(savings.ahorro_coste_pct * 10) / 10,
          ahorro_co2_kg: Math.round(savings.ahorro_co2_kg * 10) / 10,
          // El backend ya calcula el % de ahorro de CO2; lo exponemos al LLM
          // para que pueda dar la cifra relativa además de la absoluta.
          ahorro_co2_pct: Math.round(savings.ahorro_co2_pct * 10) / 10,
          retrasos_evitados: savings.retrasos_evitados,
          sobrecargas_evitadas: savings.sobrecargas_evitadas,
        },
        baseline_para_referencia: {
          distancia_km: Math.round(baseline.distancia_total_km * 10) / 10,
          coste_euros: Math.round(baseline.coste_total_euros * 100) / 100,
          // CO2 del baseline para que el LLM pueda contextualizar el ahorro
          // ("pasamos de 12.4 a 8.1 kg CO2") en lugar de mostrar solo el delta.
          co2_kg: Math.round(baseline.co2_total_kg * 10) / 10,
          retrasados: baseline.pedidos_retrasados,
        },
      },
    };
  },

  list_routes: async (args) => {
    const where: Record<string, unknown> = {};
    if (args.date) {
      const rawDate = args.date as string;
      let start: Date;
      if (rawDate === "hoy" || rawDate === "today") start = new Date();
      else if (rawDate === "ayer" || rawDate === "yesterday") {
        start = new Date();
        start.setDate(start.getDate() - 1);
      } else start = new Date(rawDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.date = { gte: start, lt: end };
      }
    }
    if (args.driverUsername) {
      const driver = await prisma.user.findUnique({
        where: { username: args.driverUsername as string },
      });
      if (driver) where.driverId = driver.id;
    }
    const routes = await prisma.route.findMany({
      where,
      include: {
        driver: { select: { fullName: true, username: true } },
        vehicle: { select: { plate: true } },
        stops: { select: { id: true, status: true } },
      },
      orderBy: { date: "desc" },
      take: 20,
    });
    return {
      ok: true,
      data: {
        total: routes.length,
        items: routes.map((r) => ({
          code: r.code,
          date: fmtDate(r.date),
          driver: r.driver?.fullName || "—",
          vehicle: r.vehicle?.plate || "—",
          status: r.status,
          stops: r.stops.length,
          delivered: r.stops.filter((s) => s.status === "DELIVERED").length,
          distance: fmtKm(r.totalDistance || 0),
        })),
      },
    };
  },

  get_route: async (args) => {
    const code = args.code as string;
    const route = await prisma.route.findFirst({
      where: { OR: [{ code }, { id: code }] },
      include: {
        driver: true,
        vehicle: true,
        stops: {
          include: { order: { include: { customer: true } } },
          orderBy: { sequence: "asc" },
        },
        incidents: true,
      },
    });
    if (!route) return { ok: false, error: `Ruta ${code} no encontrada` };
    return {
      ok: true,
      data: {
        code: route.code,
        date: fmtDate(route.date),
        driver: route.driver?.fullName || "—",
        vehicle: route.vehicle?.plate || "—",
        status: route.status,
        distance: fmtKm(route.totalDistance || 0),
        duration: fmtDur(route.totalDuration || 0),
        stops: route.stops.map((s) => ({
          sequence: s.sequence,
          orderCode: s.order.code,
          customer: s.order.customer.name,
          address: `${s.order.street} ${s.order.number}`,
          eta: fmtTime(s.etaPlanned),
          status: s.status,
        })),
        incidentsCount: route.incidents.length,
      },
      uiHint: { kind: "route_link", payload: { routeId: route.id, routeCode: route.code } },
    };
  },

  report_incident: async (args, ctx) => {
    const type = args.type as string;
    const description = args.description as string;
    if (!type || !description) return { ok: false, error: "Faltan type o description" };

    let orderId: string | null = null;
    let routeId: string | null = null;
    if (args.orderCode) {
      const o = await prisma.order.findFirst({
        where: { OR: [{ code: args.orderCode as string }, { id: args.orderCode as string }] },
      });
      orderId = o?.id || null;
    }
    if (args.routeCode) {
      const r = await prisma.route.findFirst({
        where: { OR: [{ code: args.routeCode as string }, { id: args.routeCode as string }] },
      });
      routeId = r?.id || null;
    }
    const inc = await prisma.incident.create({
      data: {
        type,
        status: "OPEN",
        description,
        durationMin: toNumber(args.durationMin) ?? null,
        orderId,
        routeId,
        reportedById: ctx.userId,
      },
    });
    return {
      ok: true,
      data: {
        id: inc.id,
        type: inc.type,
        message: `Incidencia registrada (id ${inc.id.slice(0, 8)}). ${args.routeCode && type === "VEHICLE_BREAKDOWN" ? "Llama a reschedule_route para reoptimizar la ruta." : ""}`,
      },
    };
  },

  reschedule_route: async (args, ctx) => {
    const code = args.routeCode as string;
    const delay = toNumber(args.delayMinutes);
    if (!code || delay == null || isNaN(delay)) {
      return { ok: false, error: "Faltan routeCode o delayMinutes (debe ser un número de minutos)" };
    }

    const route = await prisma.route.findFirst({
      where: { OR: [{ code }, { id: code }] },
    });
    if (!route) return { ok: false, error: `Ruta ${code} no existe` };

    let result;
    try {
      result = await rescheduleRoute(route.id, delay);
    } catch (e) {
      return {
        ok: false,
        error: `Error reoptimizando: ${e instanceof Error ? e.message : "desconocido"}`,
      };
    }

    // Apply: update RouteStops with new sequence + ETA, defer orders.
    // First, get pending stops in current route
    const pending = await prisma.routeStop.findMany({
      where: { routeId: route.id, status: { in: ["PENDING", "ARRIVED"] } },
    });
    type PendingStop = (typeof pending)[number];
    const pendingByOrder = new Map<string, PendingStop>(
      pending.map((s: PendingStop) => [s.orderId, s] as const),
    );

    // Move deferred orders to tomorrow + mark RESCHEDULED
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    for (const oid of result.deferredOrderIds) {
      const stop = pendingByOrder.get(oid);
      if (stop) {
        await prisma.routeStop.update({
          where: { id: stop.id },
          data: { status: "SKIPPED" },
        });
      }
      // Push order window to tomorrow same hour
      const order = await prisma.order.findUnique({ where: { id: oid } });
      if (order) {
        const newStart = new Date(tomorrow);
        newStart.setHours(order.windowStart.getHours(), order.windowStart.getMinutes(), 0, 0);
        const newEnd = new Date(tomorrow);
        newEnd.setHours(order.windowEnd.getHours(), order.windowEnd.getMinutes(), 0, 0);
        await prisma.order.update({
          where: { id: oid },
          data: { status: "RESCHEDULED", windowStart: newStart, windowEnd: newEnd, plannedArrival: null },
        });
      }
    }

    // Update remaining stops with new sequence + eta + polyline
    // We need to renumber starting after the highest completed sequence.
    const completed = await prisma.routeStop.findMany({
      where: { routeId: route.id, status: { in: ["DELIVERED", "FAILED"] } },
      orderBy: { sequence: "asc" },
    });
    const baseSeq = completed.length;
    for (let i = 0; i < result.remaining.length; i++) {
      const r = result.remaining[i];
      const stop = pendingByOrder.get(r.orderId);
      if (stop) {
        await prisma.routeStop.update({
          where: { id: stop.id },
          data: {
            sequence: baseSeq + i + 1,
            etaPlanned: r.etaPlanned,
            status: "PENDING",
          },
        });
        await prisma.order.update({
          where: { id: r.orderId },
          data: { plannedArrival: r.etaPlanned },
        });
      }
    }

    await prisma.route.update({
      where: { id: route.id },
      data: {
        polyline: result.polyline,
        totalDistance: result.totalDistance,
        totalDuration: result.totalDuration,
      },
    });

    // Log incident
    await prisma.incident.create({
      data: {
        type: "VEHICLE_BREAKDOWN",
        status: "OPEN",
        description: `Avería de ${delay} min comunicada por ${ctx.username}`,
        durationMin: delay,
        routeId: route.id,
        reportedById: ctx.userId,
      },
    });

    return {
      ok: true,
      data: {
        routeCode: route.code,
        newStartAt: fmtTime(result.newStartAt),
        remainingStops: result.remaining.map((s) => ({
          sequence: s.sequence,
          code: s.code,
          customer: s.customerName,
          address: `${s.street} ${s.number}`,
          eta: fmtTime(s.etaPlanned),
          withinWindow: s.withinWindow,
        })),
        deferredCount: result.deferredOrderIds.length,
        deferredCodes: await prisma.order
          .findMany({ where: { id: { in: result.deferredOrderIds } }, select: { code: true } })
          .then((rows) => rows.map((r) => r.code)),
        newDistance: fmtKm(result.totalDistance),
        newDuration: fmtDur(result.totalDuration),
        message: `Ruta ${route.code} reoptimizada. ${result.remaining.length} paradas reorganizadas, ${result.deferredOrderIds.length} diferidas a mañana.`,
      },
      uiHint: { kind: "route_rescheduled", payload: { routeId: route.id, routeCode: route.code } },
    };
  },

  mark_stop_delivered: async (args) => {
    const orderCode = args.orderCode as string;
    if (!orderCode) return { ok: false, error: "Falta orderCode" };
    const order = await prisma.order.findFirst({
      where: { OR: [{ code: orderCode }, { id: orderCode }] },
      include: { routeStop: true },
    });
    if (!order) return { ok: false, error: `Pedido ${orderCode} no existe` };
    if (!order.routeStop) {
      // Just mark order as delivered (no route assigned)
      await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
      return { ok: true, data: { message: `Pedido ${order.code} marcado entregado (sin ruta).` } };
    }
    await prisma.routeStop.update({
      where: { id: order.routeStop.id },
      data: { status: "DELIVERED", etaActual: new Date() },
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
    return { ok: true, data: { message: `Parada ${order.code} marcada entregada.` } };
  },
};
