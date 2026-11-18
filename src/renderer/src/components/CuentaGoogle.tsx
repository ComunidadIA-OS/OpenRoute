import { UserRound } from 'lucide-react'
import googleG from '../assets/google-g.png'
import { api, useUi } from '../store'

const secondary = 'rounded-lg border border-line-2 px-3 py-2 text-[12.5px] text-tx-2 hover:text-tx'

export function CuentaGoogle() {
  const account = useUi((state) => state.app?.googleAccount)
  const toast = useUi((state) => state.toast)
  if (!account) return null
  const { configured, profile, signingIn, error } = account

  const action = (operation: () => Promise<void>): void => {
    operation().catch(() => toast('No se pudo actualizar la cuenta de Google.', 'error'))
  }

  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-line-2 bg-bg-2">
          <UserRound size={19} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Cuenta de Google</h2>
          <p className="text-[12px] text-tx-3">Identificación opcional en este dispositivo</p>
        </div>
      </div>
      <p className="leading-relaxed text-tx-2">
        La cuenta sirve para identificarte en este equipo. OpenRoute guarda tu nombre y correo aquí. Los pedidos, la
        flota y los planes se guardan por separado en cada dispositivo y se pueden usar sin cuenta.
      </p>
      {profile && (
        <div className="rounded-xl border border-line-2 bg-bg-1 p-3">
          <div className="break-words font-semibold">{profile.name}</div>
          <div className="break-words text-tx-3">{profile.email}</div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-err">
          {error}
        </p>
      )}
      {signingIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-tx-2">
            Continúa en el navegador.
          </p>
          <button type="button" className={secondary} onClick={() => action(api.cancelGoogleSignIn)}>
            Cancelar
          </button>
        </div>
      ) : profile ? (
        <button type="button" className={secondary} onClick={() => action(api.signOutGoogle)}>
          Quitar cuenta de este equipo
        </button>
      ) : configured ? (
        <button
          type="button"
          className="flex h-10 items-center gap-2.5 rounded border border-[#747775] bg-white px-3 text-[14px] font-medium text-[#1f1f1f] hover:bg-[#f2f2f2]"
          onClick={() => action(api.signInWithGoogle)}
        >
          <img src={googleG} className="h-[18px] w-[18px] object-contain" alt="" />
          Iniciar sesión con Google
        </button>
      ) : (
        <p className="text-tx-3">El inicio de sesión con Google no está configurado para esta instalación.</p>
      )}
    </div>
  )
}
