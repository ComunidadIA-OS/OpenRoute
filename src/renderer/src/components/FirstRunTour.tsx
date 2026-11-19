import { useLayoutEffect, useRef, useState } from 'react'

import { useI18n } from '../lib/i18n'

const STORAGE_KEY = 'openroute:first-run-tour:v1'
const STEPS = [
  {
    selector: '[data-tour="fleet"]',
    title: 'Configura tu flota',
    description:
      'En Flota, guarda la dirección de salida y añade al menos un vehículo disponible con su capacidad y horario.'
  },
  {
    selector: '[data-tour="orders"]',
    title: 'Añade tus pedidos',
    description: 'En Pedidos puedes añadir entregas una a una o importar un archivo CSV o Excel.'
  },
  {
    selector: '[data-tour="map"]',
    title: 'Calcula las rutas',
    description: 'Abre Mapa y pulsa «Calcular rutas». Revisa las paradas y los horarios antes de aprobar el plan.'
  },
  {
    selector: '[data-tour="chat"] textarea',
    title: 'Pide cambios en el chat',
    description:
      'Con un modelo conectado, el chat puede explicar o ajustar tu plan. El motor de OpenRoute calcula las rutas con los datos de tu reparto.'
  }
] as const

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'seen'
  } catch {
    return false
  }
}

export function rememberTour(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'seen')
  } catch {
    // El diálogo se puede cerrar aunque el perfil no permita guardar la preferencia.
  }
}

export function FirstRunTour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<DOMRect | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  function dismiss(): void {
    dialog.current?.close()
    onClose()
  }

  useLayoutEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])

  useLayoutEffect(() => {
    const anchor = document.querySelector(step.selector)
    function measure(): void {
      setTarget(anchor?.getBoundingClientRect() ?? null)
    }
    measure()
    heading.current?.focus()
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    if (anchor) observer.observe(anchor)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [step.selector])

  const anchorAtBottom = target && target.bottom > window.innerHeight / 2
  const panelPosition = target
    ? {
        left: Math.min(Math.max(16, target.left + (target.width - 352) / 2), Math.max(16, window.innerWidth - 368)),
        ...(anchorAtBottom ? { bottom: window.innerHeight - target.top + 16 } : { top: target.bottom + 16 })
      }
    : { top: '25%', left: 'calc(50% - 176px)' }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="tour-heading"
      aria-describedby="tour-progress tour-description"
      onCancel={(event) => {
        event.preventDefault()
        dismiss()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-transparent text-tx backdrop:bg-black/35"
    >
      {target && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg border-2 border-ac"
          style={{
            top: target.top - 4,
            left: target.left - 4,
            width: target.width + 8,
            height: target.height + 8
          }}
        />
      )}
      <div
        className="panel absolute w-[352px] max-w-[calc(100vw-32px)] rounded-xl bg-bg-2 p-5 shadow-xl"
        style={panelPosition}
      >
        <p id="tour-progress" className="text-xs text-tx-3">
          {t('Paso {0} de {1}', index + 1, STEPS.length)}
        </p>
        <h2 id="tour-heading" ref={heading} tabIndex={-1} className="mt-2 text-base font-semibold">
          {t(step.title)}
        </h2>
        <p id="tour-description" className="mt-2 text-sm leading-relaxed text-tx-2">
          {t(step.description)}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1.5 text-sm text-tx-2 hover:text-tx focus-visible:outline-ac"
          >
            {t('Omitir')}
          </button>
          <button
            type="button"
            onClick={isLast ? dismiss : () => setIndex((current) => current + 1)}
            className="rounded-md bg-ac px-3 py-1.5 text-sm font-semibold text-ac-ink focus-visible:outline-ac"
          >
            {isLast ? t('Entendido') : t('Siguiente')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
