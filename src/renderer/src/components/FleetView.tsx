import { Plus, Trash2, Warehouse, Zap } from 'lucide-react'
import { useState } from 'react'
import type { Vehicle } from '@core/types'
import { cn, routeColor } from '../lib/format'
import { api, useUi } from '../store'

const field = 'w-full rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[13px] outline-none focus:border-ac/50'

function DepotCard() {
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const [name, setName] = useState(app.depot?.name ?? 'Depósito')
  const [address, setAddress] = useState(app.depot?.address ?? '')
  const [saving, setSaving] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
          await api.setDepot({ name, address })
          toast('Depósito guardado', 'ok')
        } catch (err) {
          toast(
            err instanceof Error
              ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
              : 'Error',
            'error'
          )
        } finally {
          setSaving(false)
        }
      }}
      className="rounded-2xl border border-line bg-bg-1/60 p-4"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Warehouse size={15} className="text-ac" /> Depósito
        {app.depot && (
          <span className="ml-auto font-mono text-[11px] text-tx-3">
            {app.depot.lat.toFixed(4)}, {app.depot.lng.toFixed(4)}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_2fr_auto] gap-2">
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <input
          className={field}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Dirección del almacén"
          required
        />
        <button
          disabled={saving}
          className="rounded-lg bg-ac px-3 text-[12.5px] font-semibold text-ac-ink disabled:opacity-60"
        >
          {saving ? 'Buscando…' : 'Guardar'}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-tx-3">Todas las rutas salen y vuelven aquí.</p>
    </form>
  )
}

function VehicleCard({ v, index }: { v: Vehicle; index: number }) {
  const [d, setD] = useState(v)
  const save = (patch: Partial<Vehicle>): void => {
    const next = { ...d, ...patch }
    setD(next)
    api.upsertVehicle(next)
  }
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition',
        d.available ? 'border-line bg-bg-1/60' : 'border-line bg-bg-1/20 opacity-60'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: routeColor(index) }} />
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none"
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
          onBlur={() => save({})}
        />
        <span className="font-mono text-[11px] text-tx-3">{d.id}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] text-tx-3">
        <label>
          Conductor
          <input
            className={field}
            value={d.driver ?? ''}
            onChange={(e) => setD({ ...d, driver: e.target.value })}
            onBlur={() => save({})}
          />
        </label>
        <label>
          Capacidad (kg)
          <input
            className={field}
            type="number"
            min={1}
            value={d.capacityKg}
            onChange={(e) => setD({ ...d, capacityKg: Number(e.target.value) })}
            onBlur={() => save({})}
          />
        </label>
        <label>
          Jornada desde
          <input type="time" className={field} value={d.start} onChange={(e) => save({ start: e.target.value })} />
        </label>
        <label>
          Hasta
          <input type="time" className={field} value={d.end} onChange={(e) => save({ end: e.target.value })} />
        </label>
        <label>
          Coste por km (€)
          <input
            className={field}
            type="number"
            step="0.01"
            min={0}
            value={d.costPerKm}
            onChange={(e) => setD({ ...d, costPerKm: Number(e.target.value) })}
            onBlur={() => save({})}
          />
        </label>
        <div className="flex items-end gap-1.5">
          <button
            onClick={() => save({ electric: !d.electric })}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-[12px]',
              d.electric ? 'border-ac/40 bg-ac-soft text-ac' : 'border-line text-tx-3'
            )}
          >
            <Zap size={12} /> Eléctrico
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <button
          onClick={() => save({ available: !d.available })}
          className="flex items-center gap-2 text-[12.5px] text-tx-2"
        >
          <span className={cn('relative h-4 w-7 rounded-full transition', d.available ? 'bg-ac' : 'bg-bg-3')}>
            <span
              className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full bg-bg transition-all',
                d.available ? 'left-3.5' : 'left-0.5'
              )}
            />
          </span>
          {d.available ? 'Disponible' : 'No disponible'}
        </button>
        <button
          onClick={() => confirm(`¿Quitar ${d.name}?`) && api.deleteVehicle(d.id)}
          className="text-tx-3 hover:text-err"
          title="Quitar vehículo"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export function FleetView() {
  const app = useUi((s) => s.app)!
  const add = (): void => {
    const n = app.vehicles.length + 1
    let id = `VAN-${String(n).padStart(2, '0')}`
    while (app.vehicles.some((v) => v.id === id)) id = `${id}b`
    api.upsertVehicle({
      id,
      name: `Furgoneta ${n}`,
      capacityKg: 600,
      costPerKm: 0.25,
      electric: false,
      start: '08:00',
      end: '18:00',
      available: true
    })
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] space-y-5 px-6 py-6">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Flota y depósito</h2>
          <p className="mt-1 text-[13px] text-tx-2">Lo que cambies aquí se aplica al recalcular el plan.</p>
        </div>
        <DepotCard key={`${app.depot?.lat}|${app.depot?.name}`} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {app.vehicles.map((v, i) => (
            <VehicleCard key={JSON.stringify(v)} v={v} index={i} />
          ))}
          <button
            onClick={add}
            className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 text-[13px] text-tx-2 hover:border-ac/40 hover:text-tx"
          >
            <Plus size={18} /> Añadir vehículo
          </button>
        </div>
      </div>
    </div>
  )
}
