// Canales entre la interfaz y el proceso principal.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { readSheet } from 'read-excel-file/node'
import { parseOrdersCsv, parseOrdersTable, type ImportResult } from '../core/import'
import { googleMapsLegs } from '../core/maps-links'
import type { Order, Vehicle } from '../core/types'
import type { ChatEvent, ImportReport, ModelRef, ProviderId, Settings } from '../shared/types'
import { sendMessage, stopChat, testModel } from './ai/agent'
import { planCsv, planPdf } from './export'
import { isAppLanguage } from './language'
import { cancelGoogleSignIn, clearGoogleAccount, startGoogleSignIn } from './google-account'
import { invalidatePlan, moveOrder, planSession } from './planner'
import { runtime, setBusy, snapshot } from './runtime'
import { geocode } from './services/geocode'
import { emptySession, newId, store } from './store'

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function applyImport(result: ImportResult, file: string): ImportReport {
  const report = { added: result.orders.length, errors: result.errors, warnings: result.warnings, file }
  if (!result.orders.length) return report

  const s = store.active()
  store.mutate(() => {
    const existing = new Set(s.orders.map((o) => o.id))
    for (const o of result.orders) {
      const id = uniqueOrderId(o.id, existing)
      existing.add(id)
      s.orders.push({ ...o, id })
    }
    invalidatePlan(s)
    store.touch(s)
  })
  return report
}

function uniqueOrderId(base: string, existing: Set<string>): string {
  let id = base
  for (let suffix = 2; existing.has(id); suffix++) id = `${base}-${suffix}`
  return id
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }
  let pending: NodeJS.Timeout | null = null
  store.on('change', () => {
    // Agrupa ráfagas de cambios (por ejemplo, durante la geocodificación).
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      send('state', snapshot())
    }, 16)
  })
  const emitChat = (e: ChatEvent): void => send('chat', e)

  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)))
  }

  handle('state:get', () => snapshot())

  handle('session:new', () => {
    const s = emptySession(store.state.settings.language)
    store.mutate((d) => {
      d.sessions.push(s)
      d.activeId = s.id
    })
  })
  handle('session:select', (id: string) => store.mutate((d) => void (d.activeId = id)))
  handle('session:rename', (id: string, title: string) => {
    const s = store.session(id)
    if (s && title.trim()) store.mutate(() => void (s.title = title.trim().slice(0, 80)))
  })
  handle('session:delete', (id: string) => {
    store.mutate((d) => {
      d.sessions = d.sessions.filter((s) => s.id !== id)
      if (d.sessions.length === 0) d.sessions.push(emptySession(d.settings.language))
      if (!d.sessions.some((s) => s.id === d.activeId)) d.activeId = d.sessions[0].id
    })
  })

  handle('orders:import', async () => {
    const w = getWindow()
    const english = store.state.settings.language === 'en'
    const res = await dialog.showOpenDialog(w!, {
      title: english ? 'Import orders' : 'Importar pedidos',
      filters: [{ name: english ? 'Orders' : 'Pedidos', extensions: ['csv', 'xlsx', 'txt'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    let result: ImportResult
    if (/\.xlsx$/i.test(file)) {
      const rows = await readSheet(file)
      result = parseOrdersTable(rows as unknown[][])
    } else {
      result = parseOrdersCsv(readFileSync(file, 'utf8'))
    }
    return applyImport(result, basename(file))
  })

  handle('orders:add', (o: Omit<Order, 'id'> & { id?: string }) => {
    const s = store.active()
    const base = o.id?.trim() || `P-${newId().slice(-5)}`
    const id = uniqueOrderId(base, new Set(s.orders.map((order) => order.id)))
    store.mutate(() => {
      s.orders.push({ ...o, id })
      invalidatePlan(s)
      store.touch(s)
    })
  })
  handle('orders:update', (id: string, patch: Partial<Order>) => {
    const s = store.active()
    const o = s.orders.find((x) => x.id === id)
    if (!o) return
    store.mutate(() => {
      if (patch.address && patch.address !== o.address && patch.lat === undefined) {
        delete o.lat
        delete o.lng
      }
      Object.assign(o, patch)
      invalidatePlan(s)
      store.touch(s)
    })
  })
  handle('orders:delete', (id: string) => {
    const s = store.active()
    store.mutate(() => {
      s.orders = s.orders.filter((o) => o.id !== id)
      invalidatePlan(s)
      store.touch(s)
    })
  })
  handle('orders:clear', () => {
    const s = store.active()
    store.mutate(() => {
      s.orders = []
      s.plan = null
      store.touch(s)
    })
  })

  handle('depot:set', async (input: { name: string; address: string; lat?: number; lng?: number }) => {
    let point = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null
    if (!point) {
      setBusy({ stage: 'geocoding', label: 'Buscando el depósito' })
      point = await geocode(input.address, store.state.settings.countryCodes)
      setBusy(null)
    }
    if (!point) throw new Error('No encuentro esa dirección. Prueba con calle, número y población.')
    store.mutate((d) => {
      d.depot = { name: input.name || 'Depósito', address: input.address, ...point! }
      d.sessions.forEach(invalidatePlan)
    })
  })
  handle('vehicle:upsert', (v: Vehicle) => {
    store.mutate((d) => {
      const i = d.vehicles.findIndex((x) => x.id === v.id)
      if (i >= 0) d.vehicles[i] = v
      else d.vehicles.push(v)
      d.sessions.forEach(invalidatePlan)
    })
  })
  handle('vehicle:delete', (id: string) => {
    store.mutate((d) => {
      d.vehicles = d.vehicles.filter((v) => v.id !== id)
      d.sessions.forEach(invalidatePlan)
    })
  })

  handle('plan:run', async () => {
    try {
      await planSession(store.active())
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errorText(e) }
    }
  })
  handle('plan:move', async (orderId: string, vehicleId: string, position?: number) => {
    try {
      await moveOrder(store.active(), orderId, vehicleId, position)
      return { ok: true }
    } catch (e) {
      setBusy(null)
      return { ok: false, error: errorText(e) }
    }
  })
  handle('plan:approve', () => {
    const s = store.active()
    if (s.plan) store.mutate(() => void (s.plan!.status = 'approved'))
  })
  handle('plan:reopen', () => {
    const s = store.active()
    if (s.plan) store.mutate(() => void (s.plan!.status = 'draft'))
  })
  handle('plan:pdf', async () => {
    const s = store.active()
    const language = store.state.settings.language
    const english = language === 'en'
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: english ? 'Save route sheets' : 'Guardar hojas de ruta',
      defaultPath: `${s.title.replace(/[\\/:*?"<>|]/g, '')} - ${english ? 'route sheets' : 'hojas de ruta'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    setBusy({ stage: 'exporting', label: 'Generando las hojas de ruta' })
    try {
      writeFileSync(res.filePath, await planPdf(s, language))
    } finally {
      setBusy(null)
    }
    shell.openPath(res.filePath)
    return res.filePath
  })
  handle('plan:csv', async () => {
    const s = store.active()
    const language = store.state.settings.language
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: language === 'en' ? 'Export plan' : 'Exportar plan',
      defaultPath: `${s.title.replace(/[\\/:*?"<>|]/g, '')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, planCsv(s, language), 'utf8')
    return res.filePath
  })
  handle('plan:links', (vehicleId: string) => {
    const s = store.active()
    const route = s.plan?.routes.find((r) => r.vehicleId === vehicleId)
    const depot = store.state.depot
    if (!route || !depot) return []
    const byId = new Map(s.orders.map((o) => [o.id, o]))
    return googleMapsLegs(depot, route.stops.map((x) => byId.get(x.orderId)!) as { lat: number; lng: number }[])
  })

  handle('chat:send', async (text: string) => {
    if (runtime.chatRunning) return
    store.emit('change')
    await sendMessage(text, emitChat)
  })
  handle('chat:stop', () => stopChat())

  handle('settings:save', (patch: Partial<Omit<Settings, 'providers'>>) => {
    if (patch.language !== undefined && !isAppLanguage(patch.language)) throw new Error('Idioma no compatible.')
    store.mutate((d) => {
      d.settings = {
        ...d.settings,
        ...patch,
        language: patch.language ?? d.settings.language,
        providers: d.settings.providers
      }
    })
  })
  handle('provider:save', (id: ProviderId, input: { apiKey?: string | null; baseURL?: string }) => {
    if (input.baseURL !== undefined) {
      store.mutate((d) => {
        d.settings.providers[id] = { ...d.settings.providers[id], baseURL: input.baseURL!.trim() }
      })
    }
    if (input.apiKey !== undefined) store.setSecret(id, input.apiKey ? input.apiKey.trim() : null)
  })
  handle('model:test', (ref: ModelRef) => testModel(ref))

  handle('google:sign-in', startGoogleSignIn)
  handle('google:cancel', cancelGoogleSignIn)
  handle('google:sign-out', clearGoogleAccount)

  handle('app:open', (url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))
}
