// Contrato entre el proceso principal y la interfaz.

import type { Depot, Order, Plan, Vehicle } from '../core/types'

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'custom'

export interface ProviderInfo {
  id: ProviderId
  name: string
  /** Necesita clave de API. */
  needsKey: boolean
  /** Admite URL base personalizada. */
  needsBaseURL: boolean
  defaultBaseURL?: string
  keyHint?: string
  keyUrl?: string
  /** Modelos sugeridos si no se puede pedir la lista al proveedor. */
  suggested: string[]
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    needsKey: true,
    needsBaseURL: false,
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    suggested: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    needsKey: true,
    needsBaseURL: false,
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    suggested: []
  },
  {
    id: 'google',
    name: 'Gemini',
    needsKey: true,
    needsBaseURL: false,
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    suggested: []
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    needsKey: true,
    needsBaseURL: false,
    keyHint: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    suggested: []
  },
  {
    id: 'ollama',
    name: 'Ollama',
    needsKey: false,
    needsBaseURL: true,
    defaultBaseURL: 'http://localhost:11434',
    suggested: []
  },
  {
    id: 'custom',
    name: 'Compatible con OpenAI',
    needsKey: false,
    needsBaseURL: true,
    defaultBaseURL: 'http://localhost:1234/v1',
    suggested: []
  }
]

export interface ModelRef {
  provider: ProviderId
  model: string
}

export interface ProviderSettings {
  hasKey: boolean
  baseURL?: string
}

export interface Settings {
  providers: Record<ProviderId, ProviderSettings>
  activeModel: ModelRef | null
  /** Motor de rutas OSRM. El público es solo para pruebas. */
  osrmUrl: string
  /** Códigos de país para geocodificar (ISO 3166-1, separados por comas). */
  countryCodes: string
  serviceMin: number
}

export type ToolStatus = 'running' | 'done' | 'error'

export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; status: ToolStatus; label: string; detail?: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  parts: ChatPart[]
  createdAt: string
  model?: string
  error?: string
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  orders: number
  planStatus: Plan['status'] | null
}

export interface SessionView extends Omit<SessionSummary, 'orders' | 'planStatus'> {
  orders: Order[]
  plan: Plan | null
  messages: ChatMessage[]
}

export interface AppState {
  depot: Depot | null
  vehicles: Vehicle[]
  sessions: SessionSummary[]
  active: SessionView | null
  settings: Settings
  busy: BusyState | null
  chatRunning: boolean
}

export interface BusyState {
  stage: 'geocoding' | 'matrix' | 'solving' | 'geometry' | 'exporting'
  label: string
  done?: number
  total?: number
}

export type ChatEvent =
  | { type: 'start'; sessionId: string; message: ChatMessage }
  | { type: 'text'; sessionId: string; messageId: string; text: string }
  | { type: 'tool'; sessionId: string; messageId: string; part: Extract<ChatPart, { type: 'tool' }> }
  | { type: 'end'; sessionId: string; messageId: string; error?: string }

export interface ImportReport {
  added: number
  errors: { row: number; message: string }[]
  warnings: { row: number; message: string }[]
  file?: string
}

export interface ModelListResult {
  models: string[]
  error?: string
}

export interface OpenRouteApi {
  getState(): Promise<AppState>
  onState(cb: (state: AppState) => void): () => void
  onChat(cb: (event: ChatEvent) => void): () => void

  newSession(): Promise<void>
  selectSession(id: string): Promise<void>
  renameSession(id: string, title: string): Promise<void>
  deleteSession(id: string): Promise<void>

  importOrders(): Promise<ImportReport | null>
  loadSample(): Promise<ImportReport>
  addOrder(order: Omit<Order, 'id'> & { id?: string }): Promise<void>
  updateOrder(id: string, patch: Partial<Order>): Promise<void>
  deleteOrder(id: string): Promise<void>
  clearOrders(): Promise<void>

  setDepot(input: { name: string; address: string; lat?: number; lng?: number }): Promise<void>
  upsertVehicle(vehicle: Vehicle): Promise<void>
  deleteVehicle(id: string): Promise<void>

  plan(): Promise<{ ok: boolean; error?: string }>
  moveOrder(orderId: string, vehicleId: string, position?: number): Promise<{ ok: boolean; error?: string }>
  approvePlan(): Promise<void>
  reopenPlan(): Promise<void>
  exportPdf(): Promise<string | null>
  exportCsv(): Promise<string | null>
  routeLinks(vehicleId: string): Promise<string[]>

  sendMessage(text: string): Promise<void>
  stopChat(): Promise<void>

  saveSettings(patch: Partial<Omit<Settings, 'providers'>>): Promise<void>
  saveProvider(id: ProviderId, input: { apiKey?: string | null; baseURL?: string }): Promise<void>
  listModels(id: ProviderId): Promise<ModelListResult>
  testModel(ref: ModelRef): Promise<{ ok: boolean; error?: string; ms?: number }>

  openExternal(url: string): Promise<void>
  appInfo(): Promise<{ version: string; platform: string }>
}
