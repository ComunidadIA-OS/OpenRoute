import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALICANTE_ADDRESSES, CUSTOMER_NAMES, DEPOT } from "./seed-data";
import { suggestRoutes } from "../src/lib/optimize";

const prisma = new PrismaClient();

function pad(n: number, width = 4) {
  return n.toString().padStart(width, "0");
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

// Day at given hour:minute, returns Date
function atTime(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding...");

  // Clean up existing data (preserve schema)
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.geocodeCache.deleteMany();
  // Users have vehicle FK so unset first
  await prisma.user.updateMany({ data: { vehicleId: null } });
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();

  // VEHICLES
  const v1 = await prisma.vehicle.create({ data: { plate: "1234-ABC", capacityKg: 800, capacityVol: 10, available: true } });
  const v2 = await prisma.vehicle.create({ data: { plate: "5678-DEF", capacityKg: 1200, capacityVol: 14, available: true } });
  const v3 = await prisma.vehicle.create({ data: { plate: "9012-GHI", capacityKg: 500, capacityVol: 6, available: true } });

  // USERS — bcrypt cost 12 (OWASP 2024 recommendation for interactive web auth).
  const BCRYPT_ROUNDS = 12;
  const adminHash = await bcrypt.hash("admin123", BCRYPT_ROUNDS);
  const driverHash = await bcrypt.hash("juan123", BCRYPT_ROUNDS);
  const mariaHash = await bcrypt.hash("maria123", BCRYPT_ROUNDS);
  const carlosHash = await bcrypt.hash("carlos123", BCRYPT_ROUNDS);
  const despachoHash = await bcrypt.hash("despacho123", BCRYPT_ROUNDS);

  await prisma.user.create({
    data: { username: "admin", passwordHash: adminHash, fullName: "Administradora Central", role: "ADMIN" },
  });
  await prisma.user.create({
    data: { username: "despacho", passwordHash: despachoHash, fullName: "Despachador Turno Mañana", role: "ADMIN" },
  });
  const juan = await prisma.user.create({
    data: { username: "juan", passwordHash: driverHash, fullName: "Juan García López", role: "DRIVER", vehicleId: v1.id },
  });
  const maria = await prisma.user.create({
    data: { username: "maria", passwordHash: mariaHash, fullName: "María Sánchez Ruiz", role: "DRIVER", vehicleId: v2.id },
  });
  const carlos = await prisma.user.create({
    data: { username: "carlos", passwordHash: carlosHash, fullName: "Carlos Hernández Mora", role: "DRIVER", vehicleId: v3.id },
  });

  // CUSTOMERS
  const customers = await Promise.all(
    CUSTOMER_NAMES.map((name, i) =>
      prisma.customer.create({
        data: {
          name,
          phone: `+34 6${pad(10000000 + i * 7919, 8)}`,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.es`,
        },
      }),
    ),
  );

  // ORDERS - generate ~50 spread over today and yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const slots: Array<[number, number]> = [
    [9, 12],
    [10, 13],
    [11, 14],
    [14, 17],
    [15, 18],
    [16, 19],
  ];

  // Today: 35 PENDING orders for the demo
  const todayCount = 35;
  for (let i = 0; i < todayCount; i++) {
    const addr = pick(ALICANTE_ADDRESSES, i);
    const customer = pick(customers, i + 3);
    const [hs, he] = pick(slots, i);
    const status = i < 30 ? "PENDING" : i < 33 ? "DISPATCHED" : "IN_TRANSIT";
    await prisma.order.create({
      data: {
        code: `ORD-${today.getFullYear()}-${pad(1000 + i, 5)}`,
        customerId: customer.id,
        street: addr.street,
        number: addr.number,
        city: "Alicante",
        postalCode: addr.postalCode,
        lat: addr.lat,
        lng: addr.lng,
        weightKg: 2 + (i % 6),
        volume: 0.05 + (i % 4) * 0.05,
        status,
        windowStart: atTime(today, hs, 0),
        windowEnd: atTime(today, he, 0),
        notes: i % 7 === 0 ? "Llamar antes de entregar" : null,
      },
    });
  }

  // Yesterday: 10 DELIVERED + 2 FAILED for historical context
  for (let i = 0; i < 12; i++) {
    const addr = pick(ALICANTE_ADDRESSES, i + 20);
    const customer = pick(customers, i + 11);
    const [hs, he] = pick(slots, i + 2);
    const status = i < 10 ? "DELIVERED" : "FAILED";
    await prisma.order.create({
      data: {
        code: `ORD-${yesterday.getFullYear()}-${pad(900 + i, 5)}`,
        customerId: customer.id,
        street: addr.street,
        number: addr.number,
        city: "Alicante",
        postalCode: addr.postalCode,
        lat: addr.lat,
        lng: addr.lng,
        weightKg: 3 + (i % 5),
        volume: 0.1 + (i % 3) * 0.05,
        status,
        windowStart: atTime(yesterday, hs, 0),
        windowEnd: atTime(yesterday, he, 0),
        plannedArrival: atTime(yesterday, hs + 1, 15 + i * 2),
      },
    });
  }

  // Mention depot for transparency
  console.log(`Depot at ${DEPOT.lat}, ${DEPOT.lng}`);
  console.log(
    `Created: 5 users, 3 vehicles, ${customers.length} customers, ${todayCount + 12} orders.`,
  );

  // ─── Rutas de demo pre-asignadas ─────────────────────────────────────
  //
  // Para que el jurado vea inmediatamente /routes con datos y el mapa
  // pintado, asignamos por defecto las opciones A y B sugeridas por el
  // optimizador a Juan y María. Esto NO bloquea la demo si el chatbot
  // tarda o falla — el jurado puede entrar directamente a /routes/<id>
  // y ver el polyline OSRM por calles reales.
  //
  // Si OSRM público no responde durante el build, capturamos el error y
  // seguimos sin rutas (mejor demo sin rutas que build roto).
  try {
    console.log("Sugiriendo rutas optimizadas para hoy con OSRM...");
    const options = await suggestRoutes(today, 10);

    if (options.length === 0) {
      console.log(
        "[seed] suggestRoutes no devolvió opciones (¿OSRM caído o pedidos sin coords?). Demo arranca sin rutas asignadas.",
      );
    } else {
      const assignments: Array<{
        option: (typeof options)[number];
        driver: typeof juan;
        letter: string;
      }> = [];
      if (options[0]) assignments.push({ option: options[0], driver: juan, letter: "A" });
      if (options[1]) assignments.push({ option: options[1], driver: maria, letter: "B" });

      const dateStr = today.toISOString().slice(0, 10);
      for (const { option, driver, letter } of assignments) {
        if (!driver.vehicleId) continue;
        const code = `RT-${dateStr}-${letter}`;
        await prisma.route.create({
          data: {
            code,
            date: today,
            driverId: driver.id,
            vehicleId: driver.vehicleId,
            status: "PLANNED",
            startDepotLat: DEPOT.lat,
            startDepotLng: DEPOT.lng,
            totalDistance: option.totalDistance,
            totalDuration: option.totalDuration,
            polyline: option.polyline,
            stops: {
              create: option.stops.map((s) => ({
                orderId: s.orderId,
                sequence: s.sequence,
                etaPlanned: s.etaPlanned,
              })),
            },
          },
        });
        // Los pedidos asignados pasan a DISPATCHED, la furgoneta queda no
        // disponible (modela una jornada con dos rutas ya planificadas).
        await prisma.$transaction([
          ...option.stops.map((s) =>
            prisma.order.update({
              where: { id: s.orderId },
              data: { status: "DISPATCHED", plannedArrival: s.etaPlanned },
            }),
          ),
          prisma.vehicle.update({
            where: { id: driver.vehicleId },
            data: { available: false },
          }),
        ]);
        console.log(
          `  ✓ ${code} → ${driver.username} (${option.stopCount} paradas, ${(option.totalDistance / 1000).toFixed(1)} km)`,
        );
      }
    }
  } catch (e) {
    console.warn(
      "[seed] No se pudieron sembrar rutas (probablemente OSRM no responde):",
      e instanceof Error ? e.message : e,
    );
    console.warn(
      "[seed] La demo arrancará sin rutas; créalas desde /chat con 'sugiere rutas para hoy'.",
    );
  }

  console.log("Logins:");
  console.log("  admin    / admin123");
  console.log("  despacho / despacho123");
  console.log("  juan     / juan123  (vehicle 1234-ABC)");
  console.log("  maria    / maria123 (vehicle 5678-DEF)");
  console.log("  carlos   / carlos123 (vehicle 9012-GHI)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
