import { FileSpreadsheet, Sparkles } from 'lucide-react'
import { api, useUi } from '../store'
import { Isotipo } from './Logo'

export function EmptyState() {
  const toast = useUi((s) => s.toast)
  const importFile = async (): Promise<void> => {
    const r = await api.importOrders()
    if (!r) return
    if (r.added === 0) toast(r.errors[0]?.message ?? 'No se ha importado ningún pedido', 'error')
    else
      toast(
        `${r.added} pedidos importados${r.errors.length ? ` · ${r.errors.length} filas con error` : ''}`,
        r.errors.length ? 'error' : 'ok'
      )
  }
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80 backdrop-blur-[2px]">
      <div className="grid-texture absolute inset-0" />
      <div className="fade-up relative flex max-w-[460px] flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-2 bg-bg-2 text-tx shadow-[0_20px_60px_-20px_rgba(200,245,96,0.35)]">
          <Isotipo size={34} live />
        </div>
        <h1 className="mt-6 text-[34px] font-semibold leading-[1.05] tracking-[-0.045em]">
          Tu reparto,
          <br />
          en piloto automático.
        </h1>
        <p className="mt-3 max-w-[380px] text-[14px] leading-relaxed text-tx-2">
          Sube los pedidos de hoy y OpenRoute calcula las rutas de tu flota. Después cámbialas hablando con la IA que
          prefieras.
        </p>
        <div className="mt-7 flex gap-2.5">
          <button
            onClick={importFile}
            className="glow flex items-center gap-2 rounded-full bg-ac px-5 py-2.5 text-[13.5px] font-semibold text-ac-ink hover:brightness-105"
          >
            <FileSpreadsheet size={15} />
            Importar CSV o Excel
          </button>
          <button
            onClick={async () => {
              const r = await api.loadSample()
              toast(`${r.added} pedidos de ejemplo en Alicante y Elche`, 'ok')
            }}
            className="flex items-center gap-2 rounded-full border border-line-2 bg-bg-2 px-5 py-2.5 text-[13.5px] text-tx hover:border-ac/40"
          >
            <Sparkles size={15} className="text-ac" />
            Probar con un ejemplo
          </button>
        </div>
        <p className="mt-5 text-[12px] text-tx-3">
          Una fila por pedido con dirección (o lat y lon), franja, peso y prioridad.{' '}
          <button
            className="text-tx-2 underline underline-offset-2 hover:text-tx"
            onClick={() =>
              api.openExternal('https://github.com/ComunidadIA-OS/OpenRoute/blob/main/docs/importar-pedidos.md')
            }
          >
            Ver formato
          </button>
        </p>
      </div>
    </div>
  )
}
