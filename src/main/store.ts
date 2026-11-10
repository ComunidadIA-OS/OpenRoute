// Estado local de la app: un JSON en la carpeta de datos del usuario.
// Las claves de API se cifran con el almacén seguro del sistema (DPAPI en
// Windows, Keychain en macOS, libsecret en Linux) y nunca llegan a la interfaz.

import { app, safeStorage } from 'electron'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelMessage } from 'ai'
import type { Depot, Order, Plan, Vehicle } from '../core/types'
import type { ChatMessage, ProviderId, Settings } from '../shared/types'
import { PROVIDERS } from '../shared/types'

export interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  orders: Order[]
  plan: Plan | null
  messages: ChatMessage[]
  /** Historial en el formato del modelo (incluye llamadas a herramientas). */
  history: ModelMessage[]
}

interface Persisted {
  version: 1
  depot: Depot | null
  vehicles: Vehicle[]
  sessions: Session[]
  activeId: string | null
  settings: Settings
  /** Claves cifradas en base64, por proveedor. */
  secrets: Partial<Record<ProviderId, string>>
}

export const DEFAULT_OSRM = 'https://router.project-osrm.org'

function defaultSettings(): Settings {
  const providers = Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { hasKey: false, ...(p.defaultBaseURL ? { baseURL: p.defaultBaseURL } : {}) }])
  ) as Settings['providers']
  return { providers, activeModel: null, osrmUrl: DEFAULT_OSRM, countryCodes: 'es', serviceMin: 8 }
}

export function newId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function sessionTitle(date = new Date()): string {
  const s = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  return `Reparto del ${s}`
}

export function emptySession(): Session {
  const now = new Date().toISOString()
  return {
    id: newId('s_'),
    title: sessionTitle(),
    createdAt: now,
    updatedAt: now,
    orders: [],
    plan: null,
    messages: [],
    history: []
  }
}

class Store extends EventEmitter {
  private data!: Persisted
  private file = ''
  private timer: NodeJS.Timeout | null = null

  load(): void {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'openroute.json')
    const fresh: Persisted = {
      version: 1,
      depot: null,
      vehicles: [],
      sessions: [],
      activeId: null,
      settings: defaultSettings(),
      secrets: {}
    }
    if (existsSync(this.file)) {
      try {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Persisted>
        const settings = { ...fresh.settings, ...raw.settings }
        settings.providers = { ...fresh.settings.providers, ...raw.settings?.providers }
        this.data = { ...fresh, ...raw, settings, version: 1 }
      } catch {
        // Un archivo dañado no debe impedir abrir la app: se aparta y se empieza de cero.
        renameSync(this.file, `${this.file}.${Date.now()}.bak`)
        this.data = fresh
      }
    } else {
      this.data = fresh
    }
    if (this.data.sessions.length === 0) {
      const s = emptySession()
      this.data.sessions.push(s)
      this.data.activeId = s.id
    }
    if (!this.data.sessions.some((s) => s.id === this.data.activeId)) {
      this.data.activeId = this.data.sessions[0].id
    }
  }

  get state(): Readonly<Persisted> {
    return this.data
  }

  /** Aplica un cambio, guarda en disco (con retardo) y avisa a la interfaz. */
  mutate(fn: (d: Persisted) => void): void {
    fn(this.data)
    this.scheduleSave()
    this.emit('change')
  }

  active(): Session {
    const s = this.data.sessions.find((x) => x.id === this.data.activeId)
    if (!s) throw new Error('No hay ningún reparto abierto.')
    return s
  }

  session(id: string): Session | undefined {
    return this.data.sessions.find((x) => x.id === id)
  }

  touch(s: Session): void {
    s.updatedAt = new Date().toISOString()
  }

  setSecret(id: ProviderId, value: string | null): void {
    this.mutate((d) => {
      if (!value) {
        delete d.secrets[id]
        d.settings.providers[id] = { ...d.settings.providers[id], hasKey: false }
        return
      }
      const enc = safeStorage.isEncryptionAvailable()
        ? `enc:${safeStorage.encryptString(value).toString('base64')}`
        : `raw:${Buffer.from(value, 'utf8').toString('base64')}`
      d.secrets[id] = enc
      d.settings.providers[id] = { ...d.settings.providers[id], hasKey: true }
    })
  }

  getSecret(id: ProviderId): string | undefined {
    const v = this.data.secrets[id]
    if (!v) return undefined
    if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'))
    if (v.startsWith('raw:')) return Buffer.from(v.slice(4), 'base64').toString('utf8')
    return undefined
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data))
    renameSync(tmp, this.file)
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 400)
  }
}

export const store = new Store()
