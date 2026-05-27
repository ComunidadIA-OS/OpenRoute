// POST /api/orders/import
//
// Importa al sistema (Prisma) los pedidos validados que devolvió el endpoint
// /optimize-csv del backend Python. Cierra el flujo de la pantalla /import:
// tras subir un CSV y revisar el plan optimizado, el usuario puede persistir
// los pedidos para que aparezcan en /orders y el chatbot pueda optimizarlos
// y crear rutas reales con conductor + furgoneta.
//
// Comportamiento:
//   - Customers se deduplican por nombre exacto (case-sensitive) dentro del
//     batch y contra la DB. Reutilizamos el id existente cuando coincide.
//   - Orders con id_pedido (code) que ya existen en la DB se OMITEN
//     silenciosamente (idempotente: reimportar el mismo CSV no duplica).
//   - Las ventanas franja_inicio/franja_fin se anclan al día indicado por
//     el cliente (default: hoy local).
//   - Se sintetiza un campo `volume` desde el peso (~10 kg/m³) porque el
//     CSV del motor no lo trae, y Order.volume es non-nullable.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Schema de cada pedido entrante. Coincide con las columnas obligatorias del
// CSV que valida data_processor.py del motor — el cliente que llama a este
// endpoint envía ya validados.
const orderSchema = z.object({
  id_pedido: z.string().min(1),
  cliente: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  peso_kg: z.number().positive(),
  franja_inicio: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM
  franja_fin: z.string().regex(/^\d{2}:\d{2}$/),
  // Opcionales — la mayoría de CSVs los traen.
  direccion: z.string().optional(),
  prioridad: z.number().int().min(1).max(3).optional(),
  observaciones: z.string().optional(),
});

const importSchema = z.object({
  orders: z.array(orderSchema).min(1).max(2000),
  // Fecha base para las ventanas horarias. Si no se pasa, hoy local.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Ciudad por defecto si la dirección no es parseable. Por defecto Alicante,
  // que es el bbox de la demo. Una pyme de otra zona lo sobreescribiría.
  defaultCity: z.string().default("Alicante"),
});

/**
 * Parsea muy modestamente una dirección "Calle X 23, Ciudad" en
 * street/number/city. No intentamos ser exhaustivos — solo dividir por la
 * primera coma y extraer un número trailing si existe. El resto vive en
 * `street` para que el operador lo vea tal cual lo subió.
 */
function parseAddress(
  raw: string | undefined,
  defaultCity: string,
): { street: string; number: string; city: string } {
  if (!raw) return { street: "—", number: "s/n", city: defaultCity };
  const trimmed = raw.trim();
  if (!trimmed) return { street: "—", number: "s/n", city: defaultCity };

  // Si hay una coma, lo último puede ser la ciudad ("Calle X 23, Alicante").
  const lastComma = trimmed.lastIndexOf(",");
  let beforeComma: string;
  let city = defaultCity;
  if (lastComma > -1) {
    beforeComma = trimmed.slice(0, lastComma).trim();
    const cityCandidate = trimmed.slice(lastComma + 1).trim();
    if (cityCandidate.length > 0 && cityCandidate.length < 64) {
      city = cityCandidate;
    }
  } else {
    beforeComma = trimmed;
  }

  // Extraer número trailing si existe ("Calle X 23" → street="Calle X", number="23").
  const numMatch = beforeComma.match(/\s+(\d+\w?(?:[-/]\d+\w?)?)\s*$/);
  if (numMatch) {
    return {
      street: beforeComma.slice(0, numMatch.index).trim() || "—",
      number: numMatch[1],
      city,
    };
  }
  return { street: beforeComma, number: "s/n", city };
}

/**
 * Construye una fecha absoluta combinando un día YYYY-MM-DD con una hora HH:MM.
 * Usa la zona horaria local del servidor (lo mismo que hace `new Date(date)`).
 */
function atTime(dateYmd: string, hhmm: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un ADMIN puede importar pedidos al sistema." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { orders, defaultCity } = parsed.data;
  const dateYmd = parsed.data.date ?? todayYmd();

  // 1. Deduplicamos customers por nombre dentro del batch y los buscamos en DB.
  const uniqueNames = Array.from(new Set(orders.map((o) => o.cliente.trim())));
  const existingCustomers = await prisma.customer.findMany({
    where: { name: { in: uniqueNames } },
  });
  const customerByName = new Map<string, string>(
    existingCustomers.map((c) => [c.name, c.id] as const),
  );

  // Creamos los customers que falten en una sola transacción para no martillear
  // la DB en lotes grandes.
  const namesToCreate = uniqueNames.filter((n) => !customerByName.has(n));
  if (namesToCreate.length > 0) {
    await prisma.$transaction(
      namesToCreate.map((name) =>
        prisma.customer.create({ data: { name } }),
      ),
    );
    const newlyCreated = await prisma.customer.findMany({
      where: { name: { in: namesToCreate } },
    });
    for (const c of newlyCreated) customerByName.set(c.name, c.id);
  }

  // 2. Detectamos qué id_pedido ya existen como Order.code y los omitimos.
  // No actualizamos lo existente — la importación es additive-only para
  // proteger cualquier estado operativo (DISPATCHED, IN_TRANSIT, etc.).
  const incomingCodes = orders.map((o) => o.id_pedido);
  const existing = await prisma.order.findMany({
    where: { code: { in: incomingCodes } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((o) => o.code));

  // 3. Crear las órdenes nuevas.
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ code: string; reason: string }> = [];

  for (const o of orders) {
    if (existingCodes.has(o.id_pedido)) {
      skipped.push(o.id_pedido);
      continue;
    }
    const customerId = customerByName.get(o.cliente.trim());
    if (!customerId) {
      // No debería ocurrir tras la sección 1, pero protegemos por defensa.
      errors.push({ code: o.id_pedido, reason: "Customer no encontrado tras creación" });
      continue;
    }
    const { street, number, city } = parseAddress(o.direccion, defaultCity);
    const windowStart = atTime(dateYmd, o.franja_inicio);
    const windowEnd = atTime(dateYmd, o.franja_fin);
    if (windowEnd <= windowStart) {
      errors.push({
        code: o.id_pedido,
        reason: `Ventana inválida: ${o.franja_inicio} > ${o.franja_fin}`,
      });
      continue;
    }

    try {
      await prisma.order.create({
        data: {
          code: o.id_pedido,
          customerId,
          street,
          number,
          city,
          lat: o.lat,
          lng: o.lon,
          weightKg: o.peso_kg,
          // Volumen sintetizado por densidad típica de mercancía paletizada
          // (~100 kg/m³). El motor no usa volume; este campo existe en el
          // schema por compatibilidad con la planificación 3D futura.
          volume: Math.max(0.05, o.peso_kg / 100),
          status: "PENDING",
          windowStart,
          windowEnd,
          notes: o.observaciones?.slice(0, 500),
        },
      });
      created.push(o.id_pedido);
    } catch (e) {
      errors.push({
        code: o.id_pedido,
        reason: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date: dateYmd,
    customersCreated: namesToCreate.length,
    customersReused: existingCustomers.length,
    ordersCreated: created.length,
    ordersSkippedAsExisting: skipped.length,
    ordersFailed: errors.length,
    // Hasta 50 ejemplos por categoría para que la UI pueda mostrarlos.
    samples: {
      created: created.slice(0, 50),
      skipped: skipped.slice(0, 50),
      errors: errors.slice(0, 50),
    },
  });
}
