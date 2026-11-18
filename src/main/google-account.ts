import { app, shell } from 'electron'
import { join } from 'node:path'
import type { GoogleAccountState } from '../shared/types'
import { readGoogleClient, signInWithGoogle } from './services/google-oauth'
import { store } from './store'

let config: ReturnType<typeof readGoogleClient> | undefined
let pending: AbortController | null = null
let error: string | null = null

function clientConfig(): ReturnType<typeof readGoogleClient> {
  if (config === undefined) {
    const resources = app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources')
    config = readGoogleClient([
      ...(process.env.OPENROUTE_GOOGLE_CLIENT_FILE ? [process.env.OPENROUTE_GOOGLE_CLIENT_FILE] : []),
      join(app.getPath('userData'), 'google-oauth.json'),
      join(resources, 'google-oauth.json')
    ])
  }
  return config
}

export function googleAccountSnapshot(): GoogleAccountState {
  return { configured: clientConfig() !== null, signingIn: pending !== null, profile: store.state.googleProfile, error }
}

export async function startGoogleSignIn(): Promise<void> {
  const credentials = clientConfig()
  if (!credentials || pending || store.state.googleProfile) return
  const controller = new AbortController()
  pending = controller
  error = null
  store.emit('change')
  try {
    const profile = await signInWithGoogle(credentials, (url) => shell.openExternal(url), controller.signal)
    if (!controller.signal.aborted) store.mutate((data) => void (data.googleProfile = profile))
  } catch (failure) {
    if (!controller.signal.aborted) {
      error =
        failure instanceof Error && failure.name === 'TimeoutError'
          ? 'Se agotó el tiempo para iniciar sesión con Google.'
          : failure instanceof Error
            ? failure.message
            : 'No se pudo iniciar sesión con Google.'
    }
  } finally {
    pending = null
    store.emit('change')
  }
}

export function cancelGoogleSignIn(): void {
  pending?.abort()
}

export function clearGoogleAccount(): void {
  cancelGoogleSignIn()
  error = null
  store.mutate((data) => void (data.googleProfile = null))
}
