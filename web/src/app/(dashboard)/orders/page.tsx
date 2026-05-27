import { prisma } from "@/lib/prisma";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderFormDialog } from "@/components/orders/OrderFormDialog";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    include: { customer: true },
    orderBy: [{ windowStart: "asc" }, { code: "asc" }],
    take: 500,
  });

  type OrderWithCustomer = (typeof orders)[number];
  const serialized = orders.map((o: OrderWithCustomer) => ({
    id: o.id,
    code: o.code,
    customer: { name: o.customer.name },
    street: o.street,
    number: o.number,
    city: o.city,
    postalCode: o.postalCode,
    lat: o.lat,
    lng: o.lng,
    status: o.status,
    windowStart: o.windowStart.toISOString(),
    windowEnd: o.windowEnd.toISOString(),
    plannedArrival: o.plannedArrival ? o.plannedArrival.toISOString() : null,
    notes: o.notes,
  }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base de datos de órdenes de reparto
          </p>
        </div>
        <OrderFormDialog />
      </div>

      <OrdersTable initialOrders={serialized} />
    </div>
  );
}
