import { CircleCheck, PanelLeftClose, Search, Settings, SquarePen, Trash2, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PROVIDERS } from '@shared/types'
import { cn, relativeTime } from '../lib/format'
import { api, useUi } from '../store'
import { Wordmark } from './Logo'
import { ProviderIcon } from './ProviderIcon'

export function Sidebar() {
  const app = useUi((s) => s.app)!
  const { openSettings, setView, toggleSidebar } = useUi()
  const [q, setQ] = useState('')
  const sessions = useMemo(
    () => app.sessions.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase())),
    [app.sessions, q]
  )
  const model = app.settings.activeModel
  const provider = model ? PROVIDERS.find((p) => p.id === model.provider) : null

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-bg-1/60">
      <div className="drag flex h-10 items-center justify-between pl-4 pr-2">
        <Wordmark size={18} />
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-tx-3 hover:bg-bg-3 hover:text-tx"
          title="Ocultar barra lateral"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="space-y-2 px-3 pt-2">
        <button
          onClick={() => api.newSession().then(() => setView('map'))}
          className="flex w-full items-center gap-2 rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-[13px] font-medium text-tx transition hover:border-ac/40 hover:bg-bg-3"
        >
          <SquarePen size={14} className="text-ac" />
          Nuevo reparto
        </button>
        <label className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-tx-3 focus-within:bg-bg-2">
          <Search size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="w-full bg-transparent text-[13px] text-tx outline-none placeholder:text-tx-3"
          />
        </label>
      </div>

      <div className="mt-3 px-4 pb-1 text-[12px] text-tx-3">Repartos</div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {sessions.map((s) => {
          const active = s.id === app.active?.id
          return (
            <div
              key={s.id}
              onClick={() => api.selectSession(s.id)}
              className={cn(
                'group relative cursor-default rounded-lg px-3 py-2 transition',
                active ? 'bg-bg-3' : 'hover:bg-bg-2'
              )}
            >
              {active && <span className="absolute left-0 top-2.5 h-5 w-[2px] rounded-full bg-ac" />}
              <div className="flex items-center justify-between gap-2">
                <span className={cn('truncate text-[13px]', active ? 'text-tx' : 'text-tx-2')}>{s.title}</span>
                <span className="shrink-0 text-[11px] text-tx-3 group-hover:hidden">{relativeTime(s.updatedAt)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`¿Borrar «${s.title}»?`)) api.deleteSession(s.id)
                  }}
                  className="hidden shrink-0 rounded p-0.5 text-tx-3 hover:text-err group-hover:block"
                  title="Borrar"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-tx-3">
                {s.orders} pedidos
                {s.planStatus === 'approved' && (
                  <span className="flex items-center gap-1 text-ac">
                    · <CircleCheck size={11} /> aprobado
                  </span>
                )}
                {s.planStatus === 'draft' && <span>· plan en borrador</span>}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        <button
          onClick={() => setView('fleet')}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-tx-2 hover:bg-bg-2 hover:text-tx"
        >
          <Truck size={15} />
          Flota y depósito
          <span className="ml-auto text-[11.5px] text-tx-3">{app.vehicles.length}</span>
        </button>
        <button
          onClick={() => openSettings('models')}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-tx-2 hover:bg-bg-2 hover:text-tx"
        >
          <Settings size={15} />
          Ajustes
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-[11.5px] text-tx-3">
            {provider && <ProviderIcon id={provider.id} size={12} />}
            <span className="truncate">{model ? model.model : 'Sin modelo'}</span>
          </span>
        </button>
      </div>
    </aside>
  )
}
