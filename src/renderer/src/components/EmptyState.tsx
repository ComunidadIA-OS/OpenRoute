import { Table2, Truck } from 'lucide-react'
import { Isotipo } from './Logo'

import { useI18n } from '../lib/i18n'
import { api, useUi } from '../store'

export function EmptyState() {
  const { t } = useI18n()
  const setView = useUi((s) => s.setView)
  const needsFleet = useUi((s) => !s.app?.depot || !s.app.vehicles.some((vehicle) => vehicle.available))
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80 backdrop-blur-[2px]">
      <div className="grid-texture absolute inset-0" />
      <div className="fade-up relative flex max-w-[460px] flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-2 bg-bg-2 text-tx shadow-[0_20px_60px_-20px_rgba(200,245,96,0.35)]">
          <Isotipo size={34} live />
        </div>
        <h1 className="mt-6 text-[34px] font-semibold leading-[1.05] tracking-[-0.045em]">
          {t('Prepara tu primer plan de reparto')}
        </h1>
        <p className="mt-3 max-w-[380px] text-[14px] leading-relaxed text-tx-2">
          {t(
            'OpenRoute calcula rutas con tu depósito, flota y pedidos. El chat es opcional y te ayuda a revisar o ajustar el plan.'
          )}
        </p>
        <div className="mt-7 flex gap-2.5">
          <button
            onClick={() => setView(needsFleet ? 'fleet' : 'orders')}
            className="glow flex items-center gap-2 rounded-full bg-ac px-5 py-2.5 text-[13.5px] font-semibold text-ac-ink hover:brightness-105"
          >
            {needsFleet ? <Truck size={15} /> : <Table2 size={15} />}
            {t(needsFleet ? 'Configurar flota y depósito' : 'Añadir pedidos')}
          </button>
          <button
            onClick={() => setView(needsFleet ? 'orders' : 'fleet')}
            className="flex items-center gap-2 rounded-full border border-line-2 bg-bg-2 px-5 py-2.5 text-[13.5px] text-tx hover:border-ac/40"
          >
            {t(needsFleet ? 'Añadir pedidos' : 'Flota y depósito')}
          </button>
        </div>
        <p className="mt-5 text-[12px] text-tx-3">
          {t('Una fila por pedido con dirección (o lat y lon), franja, peso y prioridad.')}{' '}
          <button
            className="text-tx-2 underline underline-offset-2 hover:text-tx"
            onClick={() =>
              api.openExternal('https://github.com/ComunidadIA-OS/OpenRoute/blob/main/docs/importar-pedidos.md')
            }
          >
            {t('Ver formato')}
          </button>
        </p>
      </div>
    </div>
  )
}
