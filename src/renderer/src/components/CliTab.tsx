import { ExternalLink, LoaderCircle, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cliSummary } from '@core/cli-summary'
import { LOCAL_CLIS, type LocalCliId, type LocalCliList } from '@shared/local-cli'
import { api, useUi } from '../store'

import { useI18n } from '../lib/i18n'

const button = 'rounded-lg border border-line-2 px-3 py-1.5 text-[12px] text-tx hover:bg-bg-3 disabled:opacity-50'

export function CliTab() {
  const { t, language, detail } = useI18n()
  const active = useUi((s) => s.app?.active)
  const toast = useUi((s) => s.toast)
  const [list, setList] = useState<LocalCliList | 'error' | null>(null)
  const [launching, setLaunching] = useState<LocalCliId | null>(null)

  function refresh(): void {
    setList(null)
    void api.listLocalClis().then(setList, () => setList('error'))
  }

  useEffect(() => {
    void api.listLocalClis().then(setList, () => setList('error'))
  }, [])

  async function launch(id: LocalCliId): Promise<void> {
    setLaunching(id)
    try {
      const result = await api.launchLocalCli(id)
      if (result.ok) toast(t('Terminal abierto'), 'ok')
      else toast(detail(result.error), 'error')
    } catch {
      toast(t('No se pudo abrir el terminal.'), 'error')
    } finally {
      setLaunching(null)
    }
  }

  const summary = active && active.orders.length > 0 ? cliSummary(active.orders.length, active.plan, language) : null
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-tx">
            <Terminal size={17} aria-hidden="true" /> {t('Terminales de IA')}
          </h2>
          <p className="mt-1 text-[12px] text-tx-2">
            {t(
              'Usa tu suscripción en el terminal oficial del proveedor, en una ventana aparte. Para el chat integrado, elige una conexión en Modelos de IA. La cuenta de OpenRoute se gestiona en Cuenta.'
            )}
          </p>
        </div>
        {list !== null && (list === 'error' || list.supported) && (
          <button className={`${button} shrink-0`} type="button" onClick={refresh}>
            {t('Volver a comprobar')}
          </button>
        )}
      </div>
      {list === null && (
        <p role="status" className="flex items-center gap-2 text-[12px] text-tx-2">
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> {t('Buscando terminales instalados…')}
        </p>
      )}
      {list === 'error' && (
        <p role="alert" className="text-[12px] text-err">
          {t('No se pudieron comprobar los terminales.')}
        </p>
      )}
      {list && list !== 'error' && !list.supported && (
        <p className="text-[12px] text-tx-2">{t('La apertura de estos terminales está disponible en Windows.')}</p>
      )}
      {list && list !== 'error' && list.supported && (
        <>
          <div className="divide-y divide-line rounded-xl border border-line">
            {LOCAL_CLIS.map((cli) => {
              const installed = list.clients.some((client) => client.id === cli.id && client.installed)
              return (
                <div key={cli.id} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <h3 className="text-[13px] font-medium text-tx">{cli.name}</h3>
                    <p className="text-[12px] text-tx-2">
                      {installed ? t('Instalado') : t('Ejecutable nativo sin detectar')}
                    </p>
                    {installed && <p className="mt-1 text-[12px] text-tx-3">{t(cli.signIn)}</p>}
                  </div>
                  {installed ? (
                    <button
                      className={`${button} shrink-0`}
                      type="button"
                      disabled={launching !== null}
                      onClick={() => void launch(cli.id)}
                      aria-label={t('Abrir {0} en el terminal', cli.name)}
                    >
                      {launching === cli.id ? t('Abriendo…') : t('Abrir terminal')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${button} flex shrink-0 items-center gap-1`}
                      onClick={() => api.openExternal(cli.installUrl)}
                      aria-label={t('Instalar {0}', cli.name)}
                    >
                      {t('Instalar')} <ExternalLink size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[12px] text-tx-2">
            {t('Cada terminal se abre en una carpeta vacía. Tú decides qué escribes o pegas.')}
          </p>
          {summary && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-[13px] font-medium text-tx">
                {t('Resumen para Codex o Antigravity')}
              </summary>
              <p className="my-2 text-[12px] text-tx-2">{t('Revisa estos totales antes de copiarlos al terminal.')}</p>
              <textarea
                aria-label={t('Resumen del reparto')}
                readOnly
                className="w-full rounded-lg border border-line bg-bg-1 p-2 text-[12px] text-tx"
                rows={5}
                value={summary}
              />
              <button
                type="button"
                className={`${button} mt-2`}
                onClick={() => {
                  void navigator.clipboard.writeText(summary).then(
                    () => toast(t('Resumen copiado'), 'ok'),
                    () => toast(t('No se pudo copiar el resumen.'), 'error')
                  )
                }}
              >
                {t('Copiar resumen')}
              </button>
            </details>
          )}
        </>
      )}
    </div>
  )
}
