import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Info,
  LockOpen,
  RefreshCw,
  Route as RouteIcon,
  TriangleAlert
} from 'lucide-react'
import { useState } from 'react'
import { formatDuration, toHHMM } from '@core/time'
import type { Plan, Route } from '@core/types'
import { cn, eur, kg, km, routeColor, savingPct } from '../lib/format'
import { api, useUi } from '../store'

function RouteCard({ r, index }: { r: Route; index: number }) {
  const app = useUi((s) => s.app)!
  const { focusVehicle, setFocusVehicle, toast } = useUi()
  const vehicle = app.vehicles.find((v) => v.id === r.vehicleId)
  const orders = new Map(app.active!.orders.map((o) => [o.id, o]))
  const open = focusVehicle === r.vehicleId
  const color = routeColor(index)
  const load = vehicle ? Math.min(1, r.loadKg / vehicle.capacityKg) : 0
  const approved = app.active?.plan?.status === 'approved'
  const others = app.vehicles.filter(
    (v) => v.id !== r.vehicleId && (v.available || app.active?.plan?.routes.some((x) => x.vehicleId === v.id))
  )

  const links = async (copy: boolean): Promise<void> => {
    const urls = await api.routeLinks(r.vehicleId)
    if (!urls.length) return
    if (copy) {
      const text = `${vehicle?.driver ? `Ruta de ${vehicle.driver}` : `Ruta ${r.vehicleId}`} (${r.stops.length} paradas, salida ${toHHMM(r.startMin)}):\n${urls.join('\n')}`
      await navigator.clipboard.writeText(text)
      toast('Enlace copiado. Pégalo en WhatsApp o en un correo.', 'ok')
    } else api.openExternal(urls[0])
  }

  return (
    <div
      className={cn(
        'rounded-xl border transition',
        open ? 'border-line-2 bg-bg-2' : 'border-line bg-bg-1/40 hover:border-line-2'
      )}
    >
      <button onClick={() => setFocusVehicle(open ? null : r.vehicleId)} className="w-full px-3 pb-2.5 pt-3 text-left">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="truncate text-[13px] font-medium">{vehicle?.name ?? r.vehicleId}</span>
          {vehicle?.driver && <span className="truncate text-[12px] text-tx-3">{vehicle.driver}</span>}
          <ChevronRight size={14} className={cn('ml-auto shrink-0 text-tx-3 transition', open && 'rotate-90')} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 text-[12px] text-tx-2">
          <span>{r.stops.length} paradas</span>
          <span>{km(r.distanceKm)}</span>
          <span>
            {toHHMM(r.startMin)}–{toHHMM(r.endMin)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-3">
            <div
              className="h-full rounded-full"
              style={{ width: `${load * 100}%`, background: r.overloaded ? 'var(--color-err)' : color }}
            />
          </div>
          <span className={cn('text-[11px]', r.overloaded ? 'text-err' : 'text-tx-3')}>
            {kg(r.loadKg)} / {kg(vehicle?.capacityKg ?? 0)}
          </span>
        </div>
        {(r.lateStops > 0 || r.overloaded) && (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-err">
            <TriangleAlert size={12} />
            {r.lateStops > 0 && `${r.lateStops} con retraso`}
            {r.lateStops > 0 && r.overloaded && ' · '}
            {r.overloaded && 'sobrecarga'}
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-line px-2 pb-2 pt-1.5">
          <ol className="max-h-[280px] overflow-y-auto">
            {r.stops.map((s, k) => {
              const o = orders.get(s.orderId)
              return (
                <li key={s.orderId} className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-bg-3">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-ac-ink"
                    style={{ background: color }}
                  >
                    {k + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px]">{o?.customer}</div>
                    <div className="truncate text-[11px] text-tx-3">
                      {o?.windowStart}–{o?.windowEnd} · {o?.weightKg} kg
                    </div>
                  </div>
                  <span className={cn('text-[12px] tabular-nums', s.late ? 'text-err' : 'text-tx')}>
                    {toHHMM(s.arrival + s.waitMin)}
                  </span>
                  {!approved && others.length > 0 && (
                    <select
                      value=""
                      onChange={async (e) => {
                        const res = await api.moveOrder(s.orderId, e.target.value)
                        if (!res.ok) toast(res.error ?? 'No se ha podido mover', 'error')
                      }}
                      className="hidden w-6 cursor-pointer appearance-none rounded bg-transparent text-[11px] text-transparent group-hover:block"
                      title="Mover a otro vehículo"
                    >
                      <option value="" disabled>
                        Mover a…
                      </option>
                      {others.map((v) => (
                        <option key={v.id} value={v.id} className="bg-bg-2 text-tx">
                          {v.name} ({v.id})
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="mt-1.5 flex gap-1.5 px-1">
            <button
              onClick={() => links(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-2 py-1.5 text-[12px] text-tx-2 hover:text-tx"
            >
              <ExternalLink size={12} /> Google Maps
            </button>
            <button
              onClick={() => links(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-2 py-1.5 text-[12px] text-tx-2 hover:text-tx"
            >
              <Copy size={12} /> Copiar enlace
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Savings({ plan }: { plan: Plan }) {
  const base = plan.baseline!
  const kmPct = savingPct(plan.totals.distanceKm, base.distanceKm)
  const costPct = savingPct(plan.totals.costEur, base.costEur)
  const extras: string[] = []
  if (base.overloadedRoutes > plan.totals.overloadedRoutes)
    extras.push(
      `el manual sobrecarga ${base.overloadedRoutes} ${base.overloadedRoutes === 1 ? 'vehículo' : 'vehículos'}`
    )
  if (base.lateStops > plan.totals.lateStops) extras.push(`el manual llega tarde a ${base.lateStops}`)
  const headline =
    costPct >= kmPct && costPct > 0
      ? `${costPct} % menos coste`
      : kmPct > 0
        ? `${kmPct} % menos km`
        : extras.length
          ? 'Mismo recorrido, sin errores'
          : 'Igual que el plan manual'
  return (
    <div className="mt-1.5 text-[12.5px]">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-ac">{headline}</span>
        <span className="text-tx-3">que el plan manual por zonas</span>
        <span
          className="text-tx-3"
          title="Referencia: cada vehículo cubre una zona y sale primero a lo urgente, como con un Excel."
        >
          <Info size={12} />
        </span>
      </div>
      <div className="mt-0.5 text-[11.5px] text-tx-3">
        Manual: {km(base.distanceKm)} y {eur(base.costEur)}
        {extras.length ? ` · ${extras.join(' · ')}` : ''}
      </div>
    </div>
  )
}

export function RoutesPanel() {
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const [exportOpen, setExportOpen] = useState(false)
  const session = app.active!
  const plan = session.plan
  const busy = app.busy

  const run = async (): Promise<void> => {
    const res = await api.plan()
    if (!res.ok) toast(res.error ?? 'No se ha podido planificar', 'error')
  }

  if (!plan) {
    return (
      <div className="panel fade-up absolute right-4 top-4 z-10 w-[330px] rounded-2xl p-4">
        <div className="text-[13px] text-tx-2">Pedidos de este reparto</div>
        <div className="mt-1 text-[28px] font-semibold tracking-[-0.04em]">{session.orders.length}</div>
        <div className="mt-0.5 text-[12.5px] text-tx-3">
          {app.vehicles.filter((v) => v.available).length} vehículos disponibles
          {app.depot ? ` · salen de ${app.depot.name}` : ''}
        </div>
        <button
          onClick={run}
          disabled={Boolean(busy)}
          className="glow mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ac py-2.5 text-[13.5px] font-semibold text-ac-ink transition hover:brightness-105 disabled:opacity-60"
        >
          <RouteIcon size={15} />
          Calcular rutas
        </button>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-tx-3">
          Funciona sin modelo de IA. El motor respeta franjas, capacidades y prioridades.
        </p>
      </div>
    )
  }

  const used = plan.routes.filter((r) => r.stops.length > 0)
  const base = plan.baseline
  const vehicleIndex = new Map(app.vehicles.map((v, i) => [v.id, i]))
  const orders = new Map(session.orders.map((o) => [o.id, o]))
  const approved = plan.status === 'approved'

  return (
    <div className="panel fade-up absolute bottom-4 right-4 top-4 z-10 flex w-[340px] flex-col rounded-2xl">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-tx-2">Plan del reparto</span>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px]',
              approved ? 'bg-ac-soft text-ac' : 'bg-bg-3 text-tx-2'
            )}
          >
            {approved && <Check size={11} />}
            {approved ? 'Aprobado' : 'Borrador'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-[26px] font-semibold tracking-[-0.04em]">{km(plan.totals.distanceKm)}</span>
          <span className="text-[13px] text-tx-2">{eur(plan.totals.costEur)}</span>
          <span className="text-[13px] text-tx-3">{formatDuration(plan.totals.durationMin)}</span>
        </div>
        {base && base.distanceKm > 0 && <Savings plan={plan} />}
        {plan.matrixSource === 'haversine' && (
          <div className="mt-2 text-[11.5px] text-amber">
            Distancias estimadas: no había conexión con el motor de rutas.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {used.map((r) => (
          <RouteCard key={r.vehicleId} r={r} index={vehicleIndex.get(r.vehicleId) ?? 0} />
        ))}
        {plan.unassigned.length > 0 && (
          <div className="rounded-xl border border-err/25 bg-err/5 p-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-err">
              <TriangleAlert size={13} /> {plan.unassigned.length} sin asignar
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {plan.unassigned.map((u) => (
                <li key={u.orderId} className="text-[12px]">
                  <span className="text-tx">{orders.get(u.orderId)?.customer ?? u.orderId}</span>
                  <span className="block text-tx-3">{u.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        {approved ? (
          <>
            <button
              onClick={() => api.reopenPlan()}
              className="flex items-center gap-1.5 rounded-xl border border-line-2 px-3 py-2 text-[12.5px] text-tx-2 hover:text-tx"
            >
              <LockOpen size={13} /> Reabrir
            </button>
            <div className="relative flex-1">
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ac py-2 text-[13px] font-semibold text-ac-ink hover:brightness-105"
              >
                <Download size={14} /> Exportar
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />
                  <div className="panel absolute bottom-11 left-0 right-0 z-30 rounded-xl p-1">
                    <button
                      onClick={async () => {
                        setExportOpen(false)
                        const f = await api.exportPdf()
                        if (f) toast('Hojas de ruta guardadas', 'ok')
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] hover:bg-bg-3"
                    >
                      <FileText size={13} /> Hojas de ruta (PDF)
                    </button>
                    <button
                      onClick={async () => {
                        setExportOpen(false)
                        const f = await api.exportCsv()
                        if (f) toast('Plan exportado a CSV', 'ok')
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] hover:bg-bg-3"
                    >
                      <Download size={13} /> Plan en CSV
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={run}
              disabled={Boolean(busy)}
              className="flex items-center gap-1.5 rounded-xl border border-line-2 px-3 py-2 text-[12.5px] text-tx-2 hover:text-tx disabled:opacity-50"
              title="Volver a calcular"
            >
              <RefreshCw size={13} /> Recalcular
            </button>
            <button
              onClick={() => api.approvePlan().then(() => toast('Plan aprobado. Ya puedes mandar las rutas.', 'ok'))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ac py-2 text-[13px] font-semibold text-ac-ink hover:brightness-105"
            >
              <Check size={14} /> Aprobar plan
            </button>
          </>
        )}
      </div>
    </div>
  )
}
