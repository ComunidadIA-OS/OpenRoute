import { Badge } from "@/components/ui/badge";
import { orderStatusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  DISPATCHED: "bg-blue-100 text-blue-900 hover:bg-blue-100",
  IN_TRANSIT: "bg-indigo-100 text-indigo-900 hover:bg-indigo-100",
  DELIVERED: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  FAILED: "bg-red-100 text-red-900 hover:bg-red-100",
  RESCHEDULED: "bg-purple-100 text-purple-900 hover:bg-purple-100",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", COLORS[status] || "")}>
      {orderStatusLabel(status)}
    </Badge>
  );
}
