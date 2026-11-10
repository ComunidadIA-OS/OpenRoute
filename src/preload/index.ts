import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppState, ChatEvent, OpenRouteApi } from '../shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OpenRouteApi = {
  getState: () => invoke('state:get'),
  onState: (cb) => subscribe<AppState>('state', cb),
  onChat: (cb) => subscribe<ChatEvent>('chat', cb),

  newSession: () => invoke('session:new'),
  selectSession: (id) => invoke('session:select', id),
  renameSession: (id, title) => invoke('session:rename', id, title),
  deleteSession: (id) => invoke('session:delete', id),

  importOrders: () => invoke('orders:import'),
  loadSample: () => invoke('orders:sample'),
  addOrder: (o) => invoke('orders:add', o),
  updateOrder: (id, patch) => invoke('orders:update', id, patch),
  deleteOrder: (id) => invoke('orders:delete', id),
  clearOrders: () => invoke('orders:clear'),

  setDepot: (input) => invoke('depot:set', input),
  upsertVehicle: (v) => invoke('vehicle:upsert', v),
  deleteVehicle: (id) => invoke('vehicle:delete', id),

  plan: () => invoke('plan:run'),
  moveOrder: (orderId, vehicleId, position) => invoke('plan:move', orderId, vehicleId, position),
  approvePlan: () => invoke('plan:approve'),
  reopenPlan: () => invoke('plan:reopen'),
  exportPdf: () => invoke('plan:pdf'),
  exportCsv: () => invoke('plan:csv'),
  routeLinks: (vehicleId) => invoke('plan:links', vehicleId),

  sendMessage: (text) => invoke('chat:send', text),
  stopChat: () => invoke('chat:stop'),

  saveSettings: (patch) => invoke('settings:save', patch),
  saveProvider: (id, input) => invoke('provider:save', id, input),
  listModels: (id) => invoke('provider:models', id),
  testModel: (ref) => invoke('model:test', ref),

  openExternal: (url) => invoke('app:open', url),
  appInfo: () => invoke('app:info')
}

contextBridge.exposeInMainWorld('openroute', api)
