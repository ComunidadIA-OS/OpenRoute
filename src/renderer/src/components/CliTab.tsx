import { ExternalLink, LoaderCircle, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cliSummary } from '@core/cli-summary'
import { LOCAL_CLIS, type LocalCliAction, type LocalCliId, type LocalCliList } from '@shared/local-cli'
import { api, useUi } from '../store'

import { useI18n } from '../lib/i18n'

const button = 'rounded-lg border border-line-2 px-3 py-1.5 text-[12px] text-tx hover:bg-bg-3 disabled:opacity-50'

export function CliTab() {
  const { t, language, detail } = useI18n()
  const active = useUi((s) => s.app?.active)
  const openSettings = useUi((s) => s.openSettings)
  const toast = useUi((s) => s.toast)
  const [list, setList] = useState<LocalCliList | 'error' | null>(null)
  const [launching, setLaunching] = useState<{ id: LocalCliId; action: LocalCliAction } | null>(null)
  const [selectedSummary, setSelectedSummary] = useState<string | null>(null)
  const summary = active && active.orders.length > 0 ? cliSummary(active.orders.length, active.plan, language) : null
  const includeSummary = summary !== null && selectedSummary === summary

  function refresh(): void {
    setList(null)
    void api.listLocalClis().then(setList, () => setList('error'))
  }

  useEffect(() => {
    const update = (): void => {
      void api.listLocalClis().then(setList, () => setList('error'))
    }
    update()
    window.addEventListener('focus', update)
    return () => window.removeEventListener('focus', update)
  }, [])

  async function launch(id: LocalCliId, action: LocalCliAction): Promise<void> {
    setLaunching({ id, action })
    try {
      const result = await api.launchLocalCli(
        id,
        action,
        action === 'open' && includeSummary ? (summary ?? undefined) : undefined
      )
      if (result.ok) {
        toast(t('Terminal abierto'), 'ok')
        if (action === 'open') setSelectedSummary(null)
      } else toast(detail(result.error), 'error')
    } catch {
      toast(t('No se pudo abrir el terminal.'), 'error')
    } finally {
      setLaunching(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-tx">
            <Terminal size={17} aria-hidden="true" /> {t('Usar mi suscripción')}
          </h2>
          <p className="mt-1 text-[12px] text-tx-2">
            {t(
              'Usa ChatGPT, Claude o Google en el asistente oficial de Windows, que se abre en una ventana aparte. El proveedor aplica los límites de tu plan.'
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
          {summary && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-[13px] font-medium text-tx">
                {t('Vista previa del resumen del reparto')}
              </summary>
              <p className="my-2 text-[12px] text-tx-2">
                {t(
                  'El resumen incluye los totales del reparto. Si lo marcas, el asistente podrá leerlo al abrirse y enviarlo al proveedor.'
                )}
              </p>
              <textarea
                aria-label={t('Resumen del reparto')}
                readOnly
                className="w-full rounded-lg border border-line bg-bg-1 p-2 text-[12px] text-tx"
                rows={5}
                value={summary}
              />
              <label className="mt-2 flex items-center gap-2 text-[12px] text-tx">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(event) => setSelectedSummary(event.target.checked ? summary : null)}
                />
                {t('Incluir este resumen al abrir el asistente')}
              </label>
            </details>
          )}
          <div className="divide-y divide-line rounded-xl border border-line">
            {LOCAL_CLIS.map((cli) => {
              const client = list.clients.find((client) => client.id === cli.id)
              const installed = client?.installed
              const signedIn = client?.signedIn === true
              return (
                <div key={cli.id} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <h3 className="text-[13px] font-medium text-tx">{cli.name}</h3>
                    <p className="text-[12px] text-tx-2">
                      {signedIn
                        ? t('Sesión iniciada')
                        : installed
                          ? t('Instalado')
                          : t('Instala el asistente para continuar')}
                    </p>
                    {installed && !signedIn && <p className="mt-1 text-[12px] text-tx-2">{t(cli.signIn)}</p>}
                  </div>
                  {installed ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {cli.id !== 'agy' && !signedIn && (
                        <button
                          className={button}
                          type="button"
                          disabled={launching !== null}
                          onClick={() => void launch(cli.id, 'sign-in')}
                          aria-label={t('Iniciar sesión en {0}', cli.name)}
                        >
                          {launching?.id === cli.id && launching.action === 'sign-in'
                            ? t('Abriendo…')
                            : t('Iniciar sesión')}
                        </button>
                      )}
                      <button
                        className={button}
                        type="button"
                        disabled={launching !== null}
                        onClick={() => void launch(cli.id, 'open')}
                        aria-label={t('Abrir {0} en el terminal', cli.name)}
                      >
                        {launching?.id === cli.id && launching.action === 'open'
                          ? t('Abriendo…')
                          : includeSummary
                            ? t('Abrir con resumen')
                            : t('Abrir asistente')}
                      </button>
                    </div>
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
            {t('Cada asistente se abre en una carpeta propia y usa la sesión que tú iniciaste con su proveedor.')}
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12px] text-tx-2">
        {t('El chat integrado requiere una conexión de IA propia.')}
        <button type="button" className={button} onClick={() => openSettings('models')}>
          {t('Configurar chat integrado')}
        </button>
      </div>
      <p className="text-[12px] text-tx-2">
        {t('Puedes gestionar el acceso de Google a OpenRoute en Cuenta de OpenRoute.')}
      </p>
    </div>
  )
}
