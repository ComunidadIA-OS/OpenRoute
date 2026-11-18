import { CircleHelp, LoaderCircle, Map as MapIcon, PanelLeftOpen, Table2, Truck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Chat } from './components/Chat'
import { EmptyState } from './components/EmptyState'
import { FirstRunTour, hasSeenTour, rememberTour } from './components/FirstRunTour'
import { FleetView } from './components/FleetView'
import { MapView } from './components/MapView'
import { OrdersView } from './components/OrdersView'
import { RoutesPanel } from './components/RoutesPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { cn } from './lib/format'
import { api, useUi, type View } from './store'

import { rememberLanguage, useI18n } from './lib/i18n'
import type { Message } from './lib/messages'
import type { BusyState } from '@shared/types'

const TABS: { id: View; label: Message; icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Mapa', icon: MapIcon },
  { id: 'orders', label: 'Pedidos', icon: Table2 },
  { id: 'fleet', label: 'Flota', icon: Truck }
]

function SessionTitle({ id, title }: { id: string; title: string }) {
  const { t } = useI18n()
  const [value, setValue] = useState<string | null>(null)
  const restoreFocus = useRef(false)
  const toast = useUi((s) => s.toast)

  function finish(save: boolean, keyboard = false): void {
    restoreFocus.current = keyboard
    setValue(null)
    const name = value?.trim()
    if (save && name && name !== title) {
      void api.renameSession(id, name).catch(() => toast(t('No se pudo renombrar el reparto.'), 'error'))
    }
  }

  return value !== null ? (
    <input
      autoFocus
      aria-label={t('Nombre del reparto')}
      maxLength={80}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          finish(e.key === 'Enter', true)
        }
      }}
      className="no-drag w-[300px] rounded-md bg-bg-2 px-2 py-0.5 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ac"
    />
  ) : (
    <button
      type="button"
      ref={(button) => {
        if (button && restoreFocus.current) {
          restoreFocus.current = false
          button.focus()
        }
      }}
      onClick={() => setValue(title)}
      className="no-drag max-w-[360px] truncate text-[13px] font-medium text-tx focus-visible:outline-ac"
      aria-label={t('Renombrar reparto: {0}', title)}
    >
      {title}
    </button>
  )
}

const busyMessages: Record<BusyState['stage'], Message> = {
  geocoding: 'Buscando direcciones',
  matrix: 'Calculando distancias por calles',
  solving: 'Optimizando rutas',
  geometry: 'Dibujando rutas por calles',
  exporting: 'Preparando la exportación'
}

function BusyPill() {
  const { t, language } = useI18n()
  const busy = useUi((s) => s.app?.busy)
  if (!busy) return null
  return (
    <div className="panel fade-up absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2.5 overflow-hidden rounded-full py-2 pl-3 pr-4 text-[12.5px]">
      <LoaderCircle size={14} className="animate-spin text-ac" />
      {language === 'es' ? busy.label : t(busyMessages[busy.stage])}
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
  const { t, language } = useI18n()
  const { app, view, setView, sidebarOpen, toggleSidebar, setApp, applyChat } = useUi()

  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [tourOpen, setTourOpen] = useState(() => !hasSeenTour())
  const tourButton = useRef<HTMLButtonElement>(null)

  function closeTour(): void {
    rememberTour()
    setTourOpen(false)
    tourButton.current?.focus()
  }

  useEffect(() => {
    let active = true
    let stateReceived = false
    const offState = api?.onState((state) => {
      stateReceived = true
      setApp(state)
    })
    const offChat = api?.onChat(applyChat)
    void (async () => {
      try {
        const state = await api.getState()
        if (active && !stateReceived) setApp(state)
      } catch {
        if (active && !stateReceived) setLoadFailed(true)
      }
    })()

    return () => {
      active = false
      offState?.()
      offChat?.()
    }
  }, [setApp, applyChat, loadAttempt])

  const hasSettings = app !== null
  useEffect(() => {
    document.documentElement.lang = language
    if (hasSettings) rememberLanguage(language)
  }, [hasSettings, language])

  if (!app) {
    return (
      <main className="grain flex h-full items-center justify-center bg-bg p-6 text-center">
        {loadFailed ? (
          <div>
            <h1 role="alert" className="text-base font-medium text-tx">
              {t('No se pudo abrir OpenRoute.')}
            </h1>
            <button
              type="button"
              onClick={() => {
                setLoadFailed(false)
                setLoadAttempt((attempt) => attempt + 1)
              }}
              className="mt-4 rounded-lg border border-line-2 bg-bg-2 px-3 py-1.5 text-sm text-tx hover:bg-bg-3 focus-visible:outline-ac"
            >
              {t('Reintentar')}
            </button>
          </div>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-tx-2">
            <LoaderCircle aria-hidden="true" size={16} className="animate-spin text-ac" />
            {t('Abriendo OpenRoute…')}
          </p>
        )}
      </main>
    )
  }

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
              title={t('Mostrar barra lateral')}
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          {session && <SessionTitle key={session.id} id={session.id} title={session.title} />}
          <span className="text-[12px] text-tx-3">
            {t(session?.orders.length === 1 ? '{0} pedido' : '{0} pedidos', session?.orders.length ?? 0)}
          </span>
          <nav
            aria-label={t('Navegación principal')}
            className="ml-auto flex items-center gap-0.5 rounded-lg border border-line bg-bg-1 p-0.5"
          >
            {TABS.map((tabs) => (
              <button
                key={tabs.id}
                data-tour={tabs.id}
                onClick={() => setView(tabs.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]',
                  view === tabs.id ? 'bg-bg-3 text-tx' : 'text-tx-3 hover:text-tx'
                )}
              >
                <tabs.icon size={13} />
                {t(tabs.label)}
              </button>
            ))}
          </nav>
          <button
            ref={tourButton}
            type="button"
            onClick={() => setTourOpen(true)}
            className="no-drag rounded-md p-1.5 text-tx-3 hover:bg-bg-3 hover:text-tx focus-visible:outline-ac"
            aria-label={t('Abrir guía de inicio')}
            title={t('Guía de inicio')}
          >
            <CircleHelp aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <div data-tour="chat" className="w-[400px] shrink-0 border-r border-line">
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
      {tourOpen && <FirstRunTour onClose={closeTour} />}
    </div>
  )
}
