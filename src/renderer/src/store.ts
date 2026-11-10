import { create } from 'zustand'
import type { AppState, ChatEvent } from '@shared/types'

export type View = 'map' | 'orders' | 'fleet'

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error' | 'info'
}

interface UiState {
  app: AppState | null
  view: View
  settingsOpen: boolean
  settingsTab: 'models' | 'routing' | 'about'
  focusVehicle: string | null
  sidebarOpen: boolean
  toasts: Toast[]
  setApp(app: AppState): void
  applyChat(e: ChatEvent): void
  setView(v: View): void
  openSettings(tab?: UiState['settingsTab']): void
  closeSettings(): void
  setFocusVehicle(id: string | null): void
  toggleSidebar(): void
  toast(text: string, tone?: Toast['tone']): void
}

let toastId = 0

export const useUi = create<UiState>((set, get) => ({
  app: null,
  view: 'map',
  settingsOpen: false,
  settingsTab: 'models',
  focusVehicle: null,
  sidebarOpen: true,
  toasts: [],
  setApp: (app) => set({ app }),
  applyChat: (e) => {
    const app = get().app
    if (!app?.active || app.active.id !== e.sessionId) return
    const messages = [...app.active.messages]
    if (e.type === 'start') {
      if (!messages.some((m) => m.id === e.message.id)) messages.push(e.message)
    } else {
      const i = messages.findIndex((m) => m.id === e.messageId)
      if (i < 0) return
      const msg = { ...messages[i], parts: [...messages[i].parts] }
      if (e.type === 'text') {
        const last = msg.parts[msg.parts.length - 1]
        if (last?.type === 'text') msg.parts[msg.parts.length - 1] = { ...last, text: last.text + e.text }
        else msg.parts.push({ type: 'text', text: e.text })
      } else if (e.type === 'tool') {
        const j = msg.parts.findIndex((p) => p.type === 'tool' && p.id === e.part.id)
        if (j >= 0) msg.parts[j] = e.part
        else msg.parts.push(e.part)
      } else if (e.type === 'end' && e.error) {
        msg.error = e.error
      }
      messages[i] = msg
    }
    set({ app: { ...app, active: { ...app.active, messages } } })
  },
  setView: (view) => set({ view }),
  openSettings: (tab = 'models') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),
  setFocusVehicle: (focusVehicle) => set({ focusVehicle }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toast: (text, tone = 'info') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200)
  }
}))

export const api = window.openroute
