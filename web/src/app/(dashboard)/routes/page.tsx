import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDistance, formatDuration, routeStatusLabel } from "@/lib/format";
import { MapPin, Package, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const routes = await prisma.route.findMany({
    include: {
      driver: true,
      vehicle: true,
      stops: { select: { id: true, status: true } },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rutas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico y rutas planificadas. Las nuevas rutas se crean desde el chatbot.
        </p>
      </div>

      {routes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p>Todavía no hay rutas creadas.</p>
            <p className="text-sm mt-1">
              Ve al{" "}
              <Link href="/chat" className="text-[#1a531a] underline">
                chatbot
              </Link>{" "}
              y pídele rutas para hoy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {routes.map((r: (typeof routes)[number]) => {
            const delivered = r.stops.filter((s: { status: string }) => s.status === "DELIVERED").length;
            return (
              <Link key={r.id} href={`/routes/${r.id}`}>
                <Card className="hover:border-[#1a531a] transition-colors h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-mono">{r.code}</CardTitle>
                        <CardDescription>{formatDate(r.date)}</CardDescription>
                      </div>
                      <Badge variant="outline">{routeStatusLabel(r.status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {r.driver?.fullName || "Sin conductor"} · {r.vehicle?.plate || "—"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-4 w-4" />
                      {delivered}/{r.stops.length} entregados
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {formatDistance(r.totalDistance || 0)} · {formatDuration(r.totalDuration || 0)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
