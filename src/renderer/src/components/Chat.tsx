import { ArrowUp, Check, LoaderCircle, Paperclip, Settings2, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, ChatPart } from '@shared/types'
import { cn } from '../lib/format'
import { api, useUi } from '../store'
import { Isotipo } from './Logo'
import { ProviderIcon } from './ProviderIcon'

import type { Message as MessageKey } from '../lib/messages'
import { useI18n } from '../lib/i18n'

const SUGGESTIONS = [
  'Planifica el reparto de hoy',
  '¿Qué pedidos urgentes hay y a qué hora llegan?',
  'La furgoneta diésel está en el taller. Replanifica sin ella',
  'Pásame la ruta de Lucía para mandársela por WhatsApp'
] as const

const toolLabels: Partial<Record<string, MessageKey>> = {
  get_overview: 'Revisando la operación',
  list_orders: 'Consultando pedidos',
  plan_routes: 'Calculando rutas',
  move_order: 'Moviendo pedido',
  set_vehicle: 'Actualizando la flota',
  add_order: 'Añadiendo pedido',
  remove_order: 'Quitando pedido',
  get_route: 'Abriendo ruta'
}

function ToolRow({ part }: { part: Extract<ChatPart, { type: 'tool' }> }) {
  const { t, detail } = useI18n()
  const label = toolLabels[part.name]
  return (
    <div className="flex items-center gap-2 py-0.5 text-[12.5px]">
      <span className="flex h-4 w-4 items-center justify-center">
        {part.status === 'running' && <LoaderCircle size={13} className="animate-spin text-ac" />}
        {part.status === 'done' && <Check size={13} className="text-ac" />}
        {part.status === 'error' && <X size={13} className="text-err" />}
      </span>
      <span className={part.status === 'running' ? 'text-tx' : 'text-tx-2'}>{label ? t(label) : part.label}</span>
      {part.detail && <span className="truncate text-tx-3">{detail(part.detail)}</span>}
    </div>
  )
}

function Message({ m, streaming }: { m: ChatMessage; streaming: boolean }) {
  const { t, detail } = useI18n()
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    return (
      <div className="fade-up flex justify-end">
        <div className="selectable max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-line-2 bg-bg-3 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {text}
        </div>
      </div>
    )
  }
  const last = m.parts[m.parts.length - 1]
  return (
    <div className="fade-up space-y-2">
      {m.parts.map((p, i) =>
        p.type === 'text' ? (
          <div key={i} className={cn('prose-chat selectable', streaming && p === last && 'caret')}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault()
                      if (href) api.openExternal(href)
                    }}
                  >
                    {children}
                  </a>
                )
              }}
            >
              {p.text}
            </Markdown>
          </div>
        ) : (
          <ToolRow key={p.id} part={p} />
        )
      )}
      {streaming && m.parts.length === 0 && (
        <div className="flex items-center gap-2 text-[12.5px] text-tx-3">
          <LoaderCircle size={13} className="animate-spin text-ac" /> {t('Pensando')}
        </div>
      )}
      {m.error && (
        <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-[12.5px] text-err">
          {detail(m.error)}
        </div>
      )}
    </div>
  )
}

function ChatSettings() {
  const { t } = useI18n()
  const model = useUi((s) => s.app?.settings.activeModel)
  const openSettings = useUi((s) => s.openSettings)

  return (
    <button
      type="button"
      onClick={() => openSettings(model ? 'models' : 'cli')}
      className="flex max-w-[210px] items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-tx-2 hover:bg-bg-3 hover:text-tx"
    >
      {model ? <ProviderIcon id={model.provider} size={13} /> : <Settings2 size={13} />}
      <span className="truncate">{model ? model.model : t('Configurar IA')}</span>
    </button>
  )
}

export function Chat() {
  const { t } = useI18n()
  const app = useUi((s) => s.app)!
  const toast = useUi((s) => s.toast)
  const openSettings = useUi((s) => s.openSettings)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const messages = useMemo(() => app.active?.messages ?? [], [app.active?.messages])
  const running = app.chatRunning
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [text])

  const send = (value = text): void => {
    const v = value.trim()
    if (!v || running) return
    if (!app.settings.activeModel) {
      openSettings('cli')
      return
    }
    setText('')
    api.sendMessage(v)
  }

  const importFile = async (): Promise<void> => {
    const r = await api.importOrders()
    if (r)
      toast(
        t('{0} pedidos importados{1}', r.added, r.errors.length ? t(' · {0} filas con error', r.errors.length) : ''),
        r.errors.length ? 'error' : 'ok'
      )
  }

  return (
    <section className="flex h-full min-w-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Isotipo size={44} live className="text-tx" />
            <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.03em]">{t('¿Qué repartimos hoy?')}</h2>
            <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-tx-2">
              {t('Pídelo con tus palabras. La IA entiende; las rutas las calcula el motor.')}
            </p>
            <div className="mt-6 flex w-full max-w-[340px] flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(t(s))}
                  className="rounded-xl border border-line px-3 py-2 text-left text-[12.5px] text-tx-2 transition hover:border-line-2 hover:bg-bg-2 hover:text-tx"
                >
                  {t(s)}
                </button>
              ))}
            </div>
            {!app.settings.activeModel && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => openSettings('cli')}
                  className="rounded-full bg-ac px-4 py-2 text-[13px] font-semibold text-ac-ink hover:brightness-105"
                >
                  {t('Usar mi suscripción')}
                </button>
                <button
                  type="button"
                  onClick={() => openSettings('models')}
                  className="rounded-full px-3 py-2 text-[13px] text-tx-2 hover:bg-bg-2 hover:text-tx"
                >
                  {t('Configurar chat integrado')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m) => (
              <Message key={m.id} m={m} streaming={running && m.id === lastId} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-line-2 bg-bg-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] transition focus-within:border-ac/40">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            aria-label={t('Mensaje al planificador')}
            placeholder={t('Pide un plan, un cambio o una ruta…')}
            className="block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[13.5px] text-tx outline-none placeholder:text-tx-3"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <button
              onClick={importFile}
              className="rounded-lg p-1.5 text-tx-3 hover:bg-bg-3 hover:text-tx"
              title={t('Importar pedidos (CSV o Excel)')}
            >
              <Paperclip size={15} />
            </button>
            <div className="flex items-center gap-1">
              <ChatSettings />
              {running ? (
                <button
                  onClick={() => api.stopChat()}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-tx text-bg"
                  title={t('Parar')}
                >
                  <Square size={11} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!text.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-ac text-ac-ink transition disabled:bg-bg-3 disabled:text-tx-3"
                  title={t('Enviar')}
                >
                  <ArrowUp size={15} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
