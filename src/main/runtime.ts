// Estado efímero (no se guarda en disco) y la vista que recibe la interfaz.

import type { AppState, BusyState } from '../shared/types'
import { store } from './store'

export const runtime: { busy: BusyState | null; chatRunning: boolean } = {
  busy: null,
  chatRunning: false
}

export function setBusy(busy: BusyState | null): void {
  runtime.busy = busy
  store.emit('change')
}

export function snapshot(): AppState {
  const d = store.state
  const active = d.sessions.find((s) => s.id === d.activeId) ?? null
  return {
    depot: d.depot,
    vehicles: d.vehicles,
    sessions: [...d.sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        orders: s.orders.length,
        planStatus: s.plan?.status ?? null
      })),
    active: active
      ? {
          id: active.id,
          title: active.title,
          createdAt: active.createdAt,
          updatedAt: active.updatedAt,
          orders: active.orders,
          plan: active.plan,
          messages: active.messages
        }
      : null,
    settings: d.settings,
    busy: runtime.busy,
    chatRunning: runtime.chatRunning
  }
}
