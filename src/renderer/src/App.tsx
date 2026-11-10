import { LoaderCircle, Map as MapIcon, PanelLeftOpen, Table2, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Chat } from './components/Chat'
import { EmptyState } from './components/EmptyState'
import { FleetView } from './components/FleetView'
import { MapView } from './components/MapView'
import { OrdersView } from './components/OrdersView'
import { RoutesPanel } from './components/RoutesPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { cn } from './lib/format'
import { api, useUi, type View } from './store'

const TABS: { id: View; label: string; icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Mapa', icon: MapIcon },
  { id: 'orders', label: 'Pedidos', icon: Table2 },
  { id: 'fleet', label: 'Flota', icon: Truck }
]

function SessionTitle() {
  const active = useUi((s) => s.app?.active)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  if (!active) return null
  return editing ? (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setEditing(false)
        api.renameSession(active.id, value)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="no-drag w-[300px] rounded-md bg-bg-2 px-2 py-0.5 text-[13px] outline-none"
    />
  ) : (
    <button
      onDoubleClick={() => {
        setValue(active.title)
        setEditing(true)
      }}
      className="no-drag max-w-[360px] truncate text-[13px] font-medium text-tx"
      title="Doble clic para renombrar"
    >
      {active.title}
    </button>
  )
}

function BusyPill() {
  const busy = useUi((s) => s.app?.busy)
  if (!busy) return null
  return (
    <div className="panel fade-up absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2.5 overflow-hidden rounded-full py-2 pl-3 pr-4 text-[12.5px]">
      <LoaderCircle size={14} className="animate-spin text-ac" />
      {busy.label}
      {busy.total ? (
        <span className="tabular-nums text-tx-3">
          {busy.done ?? 0}/{busy.total}
        </span>
      ) : null}
      <span className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden">
        <span className="indeterminate block h-full w-1/3 bg-ac" />
      </span>
    </div>
  )
}

function Toasts() {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'panel fade-up rounded-full px-4 py-2 text-[12.5px]',
            t.tone === 'error' ? 'border-err/40 text-err' : t.tone === 'ok' ? 'text-tx' : 'text-tx-2'
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function App() {
  const { app, view, setView, sidebarOpen, toggleSidebar, setApp, applyChat } = useUi()

  useEffect(() => {
    api.getState().then(setApp)
    const off1 = api.onState(setApp)
    const off2 = api.onChat(applyChat)
    return () => {
      off1()
      off2()
    }
  }, [setApp, applyChat])

  if (!app) return <div className="h-full bg-bg" />
  const session = app.active
  const isWin = navigator.userAgent.includes('Windows')

  return (
    <div className="grain flex h-full">
      {sidebarOpen && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'drag flex h-10 shrink-0 items-center gap-3 border-b border-line pl-4',
            isWin ? 'pr-[150px]' : 'pr-4'
          )}
        >
          {!sidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="rounded-md p-1 text-tx-3 hover:bg-bg-3 hover:text-tx"
              title="Mostrar barra lateral"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          <SessionTitle />
          <span className="text-[12px] text-tx-3">{session?.orders.length ?? 0} pedidos</span>
          <nav className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-bg-1 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]',
                  view === t.id ? 'bg-bg-3 text-tx' : 'text-tx-3 hover:text-tx'
                )}
              >
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </nav>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="w-[400px] shrink-0 border-r border-line">
            <Chat />
          </div>
          <main className="relative min-w-0 flex-1 overflow-hidden">
            <div className={cn('absolute inset-0', view !== 'map' && 'invisible')}>
              <MapView />
              {session && session.orders.length === 0 && <EmptyState />}
              {session && session.orders.length > 0 && <RoutesPanel />}
              <BusyPill />
            </div>
            {view === 'orders' && (
              <div className="absolute inset-0 z-30 bg-bg">
                <OrdersView />
              </div>
            )}
            {view === 'fleet' && (
              <div className="absolute inset-0 z-30 bg-bg">
                <FleetView />
              </div>
            )}
          </main>
        </div>
      </div>
      <SettingsDialog />
      <Toasts />
    </div>
  )
}
