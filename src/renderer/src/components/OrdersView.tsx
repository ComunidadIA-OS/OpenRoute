import { FileSpreadsheet, MapPinOff, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toHHMM } from '@core/time'
import type { Order, Priority } from '@core/types'
import { cn, priorityLabel, routeColor } from '../lib/format'
import { api, useUi } from '../store'

const PRIORITY_STYLE: Record<Priority, string> = {
  3: 'bg-err/12 text-err',
  2: 'bg-bg-3 text-tx-2',
  1: 'bg-transparent text-tx-3 border border-line'
}

function AddOrder({ onClose }: { onClose: () => void }) {
  const toast = useUi((s) => s.toast)
  const [f, setF] = useState({
    customer: '',
    address: '',
    weightKg: '',
    windowStart: '09:00',
    windowEnd: '14:00',
    priority: '2'
  })
  const input =
    'w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 py-1.5 text-[13px] outline-none focus:border-ac/50'
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!f.address.trim()) return
        await api.addOrder({
          customer: f.customer || f.address,
          address: f.address,
          weightKg: Number(f.weightKg.replace(',', '.')) || 0,
          windowStart: f.windowStart,
          windowEnd: f.windowEnd,
          priority: Number(f.priority) as Priority
        })
        toast('Pedido añadido. Se ubicará en el mapa al calcular.', 'ok')
        onClose()
      }}
      className="fade-up grid grid-cols-[1.2fr_2fr_0.6fr_0.6fr_0.6fr_0.7fr_auto] items-end gap-2 border-b border-line bg-bg-1 px-5 py-3"
    >
      <label className="text-[11.5px] text-tx-3">
        Cliente
        <input
          autoFocus
          className={input}
          value={f.customer}
          onChange={(e) => setF({ ...f, customer: e.target.value })}
        />
      </label>
      <label className="text-[11.5px] text-tx-3">
        Dirección
        <input
          className={input}
          required
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          placeholder="Calle, número, población"
        />
      </label>
      <label className="text-[11.5px] text-tx-3">
        Kg
        <input className={input} value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} />
      </label>
      <label className="text-[11.5px] text-tx-3">
        Desde
        <input
          type="time"
          className={input}
          value={f.windowStart}
          onChange={(e) => setF({ ...f, windowStart: e.target.value })}
        />
      </label>
      <label className="text-[11.5px] text-tx-3">
        Hasta
        <input
          type="time"
          className={input}
          value={f.windowEnd}
          onChange={(e) => setF({ ...f, windowEnd: e.target.value })}
        />
      </label>
      <label className="text-[11.5px] text-tx-3">
        Prioridad
        <select className={input} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="3">Alta</option>
          <option value="2">Media</option>
          <option value="1">Baja</option>
        </select>
      </label>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-[12.5px] text-tx-2 hover:text-tx"
        >
          Cancelar
        </button>
        <button className="rounded-lg bg-ac px-3 py-1.5 text-[12.5px] font-semibold text-ac-ink">Añadir</button>
      </div>
    </form>
  )
}

export function OrdersView() {
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const session = app.active!
  const plan = session.plan
  const where = useMemo(() => {
    const m = new Map<string, { vehicleId: string; eta: number; late: boolean }>()
    plan?.routes.forEach((r) =>
      r.stops.forEach((s) => m.set(s.orderId, { vehicleId: r.vehicleId, eta: s.arrival + s.waitMin, late: s.late }))
    )
    return m
  }, [plan])
  const vehicleIndex = new Map(app.vehicles.map((v, i) => [v.id, i]))
  const rows = session.orders.filter((o: Order) =>
    `${o.id} ${o.customer} ${o.address} ${o.notes ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <label className="flex w-[280px] items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-tx-3 focus-within:border-line-2">
          <Search size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pedidos"
            className="w-full bg-transparent text-[13px] text-tx outline-none placeholder:text-tx-3"
          />
        </label>
        <span className="text-[12.5px] text-tx-3">{session.orders.length} pedidos</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={async () => {
              const r = await api.importOrders()
              if (r)
                toast(
                  `${r.added} pedidos importados${r.errors.length ? ` · ${r.errors.length} con error` : ''}`,
                  r.errors.length ? 'error' : 'ok'
                )
            }}
            className="flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-1.5 text-[12.5px] text-tx-2 hover:text-tx"
          >
            <FileSpreadsheet size={13} /> Importar
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-ac px-3 py-1.5 text-[12.5px] font-semibold text-ac-ink"
          >
            <Plus size={13} /> Pedido
          </button>
          {session.orders.length > 0 && (
            <button
              onClick={() => confirm('¿Quitar todos los pedidos de este reparto?') && api.clearOrders()}
              className="rounded-lg px-2 py-1.5 text-tx-3 hover:text-err"
              title="Quitar todos"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {adding && <AddOrder onClose={() => setAdding(false)} />}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-bg">
            <tr className="text-left text-tx-3">
              {['Pedido', 'Cliente', 'Dirección', 'Franja', 'Kg', 'Prioridad', 'Ruta', 'Llegada', ''].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 font-normal first:pl-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const w = where.get(o.id)
              const unassigned = plan?.unassigned.find((u) => u.orderId === o.id)
              return (
                <tr key={o.id} className="group hover:bg-bg-1">
                  <td className="selectable border-b border-line py-2 pl-5 pr-3 whitespace-nowrap font-mono text-[11.5px] text-tx-2">
                    {o.id}
                  </td>
                  <td className="border-b border-line px-3 py-2">
                    {o.customer}
                    {o.notes && <div className="max-w-[220px] truncate text-[11.5px] text-tx-3">{o.notes}</div>}
                  </td>
                  <td className="border-b border-line px-3 py-2 text-tx-2">
                    <span className="flex items-center gap-1.5">
                      {o.lat === undefined && <MapPinOff size={12} className="shrink-0 text-amber" />}
                      <span className="max-w-[240px] truncate">{o.address}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2 tabular-nums text-tx-2">
                    {o.windowStart}–{o.windowEnd}
                  </td>
                  <td className="border-b border-line px-3 py-2 tabular-nums text-tx-2">{o.weightKg}</td>
                  <td className="border-b border-line px-3 py-2">
                    <select
                      value={o.priority}
                      onChange={(e) => api.updateOrder(o.id, { priority: Number(e.target.value) as Priority })}
                      className={cn(
                        'cursor-pointer appearance-none rounded-full px-2 py-0.5 text-[11.5px] outline-none',
                        PRIORITY_STYLE[o.priority]
                      )}
                    >
                      {([3, 2, 1] as Priority[]).map((p) => (
                        <option key={p} value={p} className="bg-bg-2 text-tx">
                          {priorityLabel[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-line px-3 py-2">
                    {w ? (
                      <span className="flex items-center gap-1.5 text-tx-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: routeColor(vehicleIndex.get(w.vehicleId) ?? 0) }}
                        />
                        {w.vehicleId}
                      </span>
                    ) : unassigned ? (
                      <span className="text-err" title={unassigned.reason}>
                        Sin asignar
                      </span>
                    ) : (
                      <span className="text-tx-3">—</span>
                    )}
                  </td>
                  <td className={cn('border-b border-line px-3 py-2 tabular-nums', w?.late ? 'text-err' : 'text-tx')}>
                    {w ? toHHMM(w.eta) : ''}
                  </td>
                  <td className="border-b border-line px-3 py-2 text-right">
                    <button
                      onClick={() => api.deleteOrder(o.id)}
                      className="invisible text-tx-3 hover:text-err group-hover:visible"
                      title="Quitar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-10 text-center text-[13px] text-tx-3">No hay pedidos{q ? ' con ese filtro' : ''}.</div>
        )}
      </div>
    </div>
  )
}
