import { Check, ExternalLink, KeyRound, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PROVIDERS, type ProviderId } from '@shared/types'
import { cn } from '../lib/format'
import { api, useUi } from '../store'
import { Isotipo } from './Logo'
import { ProviderIcon } from './ProviderIcon'

const field = 'w-full rounded-lg border border-line-2 bg-bg-1 px-3 py-2 text-[13px] outline-none focus:border-ac/50'

function ProviderEditor({ id }: { id: ProviderId }) {
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const info = PROVIDERS.find((p) => p.id === id)!
  const cfg = app.settings.providers[id]
  const [key, setKey] = useState('')
  const [baseURL, setBaseURL] = useState(cfg?.baseURL ?? info.defaultBaseURL ?? '')
  const [models, setModels] = useState<string[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const autoLoad = info.needsKey ? Boolean(cfg?.hasKey) : true
  const [loading, setLoading] = useState(autoLoad)
  const [model, setModel] = useState(app.settings.activeModel?.provider === id ? app.settings.activeModel.model : '')
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const ready = info.needsKey ? cfg?.hasKey : Boolean(baseURL)

  const apply = (r: { models: string[]; error?: string }): void => {
    setLoading(false)
    setModels(r.models)
    setListError(r.error ?? null)
    setModel((m) => m || r.models[0] || '')
  }
  const load = async (): Promise<void> => {
    setLoading(true)
    apply(await api.listModels(id))
  }

  useEffect(() => {
    if (autoLoad) api.listModels(id).then(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-bg-2">
          <ProviderIcon id={id} size={20} />
        </span>
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.02em]">{info.name}</div>
          <div className="text-[12px] text-tx-3">
            {id === 'ollama'
              ? 'Modelos en tu ordenador. Nada sale de tu máquina.'
              : id === 'custom'
                ? 'LM Studio, vLLM, Groq, Mistral… cualquier API compatible con OpenAI.'
                : id === 'openrouter'
                  ? 'Cientos de modelos con una sola clave.'
                  : 'Usa tu propia clave. Pagas al proveedor, sin intermediarios.'}
          </div>
        </div>
      </div>

      {info.needsBaseURL && (
        <label className="block text-[12px] text-tx-3">
          URL del servidor
          <div className="mt-1 flex gap-2">
            <input className={field} value={baseURL} onChange={(e) => setBaseURL(e.target.value)} />
            <button
              onClick={async () => {
                await api.saveProvider(id, { baseURL })
                load()
              }}
              className="shrink-0 rounded-lg border border-line-2 px-3 text-[12.5px] text-tx-2 hover:text-tx"
            >
              Conectar
            </button>
          </div>
        </label>
      )}

      {(info.needsKey || id === 'custom') && (
        <label className="block text-[12px] text-tx-3">
          <span className="flex items-center justify-between">
            Clave de API{!info.needsKey && ' (opcional)'}
            {info.keyUrl && (
              <button
                onClick={() => api.openExternal(info.keyUrl!)}
                className="flex items-center gap-1 text-tx-2 hover:text-tx"
              >
                Conseguir una clave <ExternalLink size={11} />
              </button>
            )}
          </span>
          <div className="mt-1 flex gap-2">
            <input
              className={field}
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={cfg?.hasKey ? 'Guardada y cifrada en este equipo' : info.keyHint}
            />
            <button
              disabled={!key.trim()}
              onClick={async () => {
                await api.saveProvider(id, { apiKey: key })
                setKey('')
                toast('Clave guardada', 'ok')
                load()
              }}
              className="shrink-0 rounded-lg bg-ac px-3 text-[12.5px] font-semibold text-ac-ink disabled:bg-bg-3 disabled:text-tx-3"
            >
              Guardar
            </button>
            {cfg?.hasKey && (
              <button
                onClick={() => api.saveProvider(id, { apiKey: null })}
                className="shrink-0 rounded-lg border border-line-2 px-3 text-[12.5px] text-tx-2 hover:text-err"
              >
                Quitar
              </button>
            )}
          </div>
          <span className="mt-1 flex items-center gap-1 text-[11.5px]">
            <KeyRound size={11} /> Se cifra con el almacén seguro del sistema y nunca sale de este equipo salvo hacia{' '}
            {info.name}.
          </span>
        </label>
      )}

      <div className="block text-[12px] text-tx-3">
        Modelo
        <div className="mt-1 flex gap-2">
          {models.length > 0 ? (
            <select className={field} value={model} onChange={(e) => setModel(e.target.value)}>
              {!models.includes(model) && model && <option value={model}>{model}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={field}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Nombre exacto del modelo"
            />
          )}
          <button
            disabled={!model || !ready}
            onClick={async () => {
              setTest({ ok: true, text: 'Probando…' })
              const r = await api.testModel({ provider: id, model })
              setTest(
                r.ok
                  ? { ok: true, text: `Responde en ${((r.ms ?? 0) / 1000).toFixed(1)} s` }
                  : { ok: false, text: r.error ?? 'Error' }
              )
            }}
            className="shrink-0 rounded-lg border border-line-2 px-3 text-[12.5px] text-tx-2 hover:text-tx disabled:opacity-40"
          >
            Probar
          </button>
          <button
            disabled={!model || !ready}
            onClick={async () => {
              await api.saveSettings({ activeModel: { provider: id, model } })
              toast(`Ahora hablas con ${model}`, 'ok')
            }}
            className="shrink-0 rounded-lg bg-tx px-3 text-[12.5px] font-semibold text-bg disabled:opacity-40"
          >
            Usar
          </button>
        </div>
        {loading && (
          <span className="mt-1 flex items-center gap-1 text-[11.5px]">
            <LoaderCircle size={11} className="animate-spin" /> Cargando modelos…
          </span>
        )}
        {listError && (
          <span className="mt-1 block text-[11.5px] text-amber">No se ha podido pedir la lista: {listError}</span>
        )}
        {test && <span className={cn('mt-1 block text-[11.5px]', test.ok ? 'text-ac' : 'text-err')}>{test.text}</span>}
      </div>
      <p className="text-[11.5px] leading-relaxed text-tx-3">
        El planificador necesita un modelo que sepa usar herramientas. Los modelos grandes de Claude, ChatGPT y Gemini
        van sobrados; en local, prueba qwen3 o llama3.1 de 8B o más.
      </p>
    </div>
  )
}

function RoutingTab() {
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const [s, setS] = useState({
    osrmUrl: app.settings.osrmUrl,
    countryCodes: app.settings.countryCodes,
    serviceMin: app.settings.serviceMin
  })
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        await api.saveSettings({ ...s, serviceMin: Math.max(0, Number(s.serviceMin) || 0) })
        toast('Ajustes guardados', 'ok')
      }}
    >
      <label className="block text-[12px] text-tx-3">
        Motor de rutas (OSRM)
        <input
          className={`${field} mt-1`}
          value={s.osrmUrl}
          onChange={(e) => setS({ ...s, osrmUrl: e.target.value })}
        />
        <span className="mt-1 block text-[11.5px] leading-relaxed">
          Por defecto usa el servidor público de demostración de OSRM, pensado para pruebas. Para uso diario, monta el
          tuyo con el mapa de tu país. Si no responde, la app estima las distancias en línea recta.
        </span>
      </label>
      <label className="block text-[12px] text-tx-3">
        Países para buscar direcciones
        <input
          className={`${field} mt-1`}
          value={s.countryCodes}
          onChange={(e) => setS({ ...s, countryCodes: e.target.value })}
        />
        <span className="mt-1 block text-[11.5px]">
          Códigos ISO separados por comas, por ejemplo «es,pt». Vacío para todo el mundo.
        </span>
      </label>
      <label className="block text-[12px] text-tx-3">
        Minutos por parada
        <input
          type="number"
          min={0}
          className={`${field} mt-1 w-32`}
          value={s.serviceMin}
          onChange={(e) => setS({ ...s, serviceMin: Number(e.target.value) })}
        />
      </label>
      <button className="rounded-lg bg-ac px-4 py-2 text-[12.5px] font-semibold text-ac-ink">Guardar</button>
    </form>
  )
}

function AboutTab() {
  const [info, setInfo] = useState<{ version: string } | null>(null)
  useEffect(() => {
    api.appInfo().then(setInfo)
  }, [])
  const link = (href: string, label: string) => (
    <button onClick={() => api.openExternal(href)} className="text-tx-2 underline underline-offset-2 hover:text-tx">
      {label}
    </button>
  )
  return (
    <div className="space-y-4 text-[13px] text-tx-2">
      <div className="flex items-center gap-3">
        <Isotipo size={36} live className="text-tx" />
        <div>
          <div className="text-[16px] font-semibold tracking-[-0.02em] text-tx">OpenRoute {info?.version}</div>
          <div className="text-[12px] text-tx-3">Código abierto con licencia Apache 2.0</div>
        </div>
      </div>
      <p className="leading-relaxed">
        Planifica las rutas de reparto de tu flota en tu ordenador. Los pedidos y el plan se guardan solo en este
        equipo; al modelo de IA le llega lo que haga falta para responderte.
      </p>
      <p className="leading-relaxed">
        Mapa: © colaboradores de {link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}, teselas de{' '}
        {link('https://openfreemap.org', 'OpenFreeMap')}. Rutas: {link('https://project-osrm.org', 'OSRM')}.
        Direcciones: {link('https://nominatim.org', 'Nominatim')}. Iconos de proveedores:{' '}
        {link('https://github.com/lobehub/lobe-icons', 'LobeHub')} (MIT).
      </p>
      <div className="flex gap-4">
        {link('https://github.com/ComunidadIA-OS/OpenRoute', 'Código en GitHub')}
        {link('https://openroute.es', 'openroute.es')}
      </div>
    </div>
  )
}

export function SettingsDialog() {
  const { settingsOpen, settingsTab, closeSettings, openSettings } = useUi()
  const app = useUi((s) => s.app)!
  const [provider, setProvider] = useState<ProviderId>(app.settings.activeModel?.provider ?? 'anthropic')
  if (!settingsOpen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={closeSettings}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-up flex h-[600px] w-[860px] overflow-hidden rounded-2xl border border-line-2 bg-bg shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
      >
        <nav className="w-[200px] shrink-0 border-r border-line bg-bg-1 p-3">
          <div className="px-2 pb-3 pt-1 text-[15px] font-semibold tracking-[-0.02em]">Ajustes</div>
          {(
            [
              ['models', 'Modelos de IA'],
              ['routing', 'Mapa y rutas'],
              ['about', 'Acerca de']
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => openSettings(k)}
              className={cn(
                'block w-full rounded-lg px-2.5 py-2 text-left text-[13px]',
                settingsTab === k ? 'bg-bg-3 text-tx' : 'text-tx-2 hover:bg-bg-2 hover:text-tx'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <button
            onClick={closeSettings}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-tx-3 hover:bg-bg-2 hover:text-tx"
          >
            <X size={16} />
          </button>
          {settingsTab === 'models' && (
            <div className="flex min-h-0 flex-1">
              <div className="w-[230px] shrink-0 space-y-1 overflow-y-auto border-r border-line p-3 pt-12">
                <div className="px-1 pb-2 text-[12px] text-tx-3">Trae tu propio modelo</div>
                {PROVIDERS.map((p) => {
                  const cfg = app.settings.providers[p.id]
                  const connected = p.needsKey ? cfg?.hasKey : p.id === 'ollama' || Boolean(cfg?.hasKey)
                  const active = app.settings.activeModel?.provider === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left',
                        provider === p.id ? 'border-line-2 bg-bg-2' : 'border-transparent hover:bg-bg-1'
                      )}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-bg-1">
                        <ProviderIcon id={p.id} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{p.name}</span>
                        <span className={cn('block text-[11px]', active ? 'text-ac' : 'text-tx-3')}>
                          {active
                            ? 'En uso'
                            : connected && p.needsKey
                              ? 'Clave guardada'
                              : p.needsKey
                                ? 'Sin clave'
                                : 'Local'}
                        </span>
                      </span>
                      {active && <Check size={13} className="text-ac" />}
                    </button>
                  )
                })}
              </div>
              <div className="min-w-0 flex-1 overflow-y-auto p-6 pt-12">
                <ProviderEditor key={provider} id={provider} />
              </div>
            </div>
          )}
          {settingsTab === 'routing' && (
            <div className="overflow-y-auto p-6 pt-12">
              <RoutingTab />
            </div>
          )}
          {settingsTab === 'about' && (
            <div className="overflow-y-auto p-6 pt-12">
              <AboutTab />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
