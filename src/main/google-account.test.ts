import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ dir: '', openExternal: vi.fn() }))
const oauth = vi.hoisted(() => ({ readGoogleClient: vi.fn(), signInWithGoogle: vi.fn() }))

vi.mock('electron', () => ({
  app: { getPath: () => electron.dir, getPreferredSystemLanguages: () => ['es-ES'], isPackaged: false },
  shell: { openExternal: electron.openExternal }
}))
vi.mock('./services/google-oauth', () => oauth)

beforeEach(() => {
  vi.resetModules()
  electron.dir = mkdtempSync(join(tmpdir(), 'openroute-perfil-'))
  oauth.readGoogleClient.mockReturnValue({ client_id: '123.apps.googleusercontent.com' })
})

afterEach(() => {
  vi.resetAllMocks()
  rmSync(electron.dir, { recursive: true, force: true })
})

describe('cuenta local de Google', () => {
  it('recupera la identidad al reiniciar y al quitarla conserva el reparto', async () => {
    const { store } = await import('./store')
    const { startGoogleSignIn } = await import('./google-account')
    const profile = { name: 'Ana', email: 'ana@example.org' }
    oauth.signInWithGoogle.mockResolvedValue(profile)
    store.load()
    const reparto = store.active().id

    await startGoogleSignIn()
    store.flush()
    const enDisco = JSON.parse(readFileSync(join(electron.dir, 'openroute.json'), 'utf8'))
    expect(enDisco.googleProfile).toEqual(profile)

    vi.resetModules()
    const reopened = await import('./store')
    const { googleAccountSnapshot, clearGoogleAccount } = await import('./google-account')
    reopened.store.load()
    expect(googleAccountSnapshot().profile).toEqual(profile)
    clearGoogleAccount()
    reopened.store.flush()
    expect(googleAccountSnapshot().profile).toBeNull()
    expect(reopened.store.active().id).toBe(reparto)
  })

  it('permite abrir un perfil antiguo y seguir usando la app sin configurar Google', async () => {
    writeFileSync(join(electron.dir, 'openroute.json'), JSON.stringify({ version: 1, sessions: [] }))
    oauth.readGoogleClient.mockReturnValue(null)
    const { store } = await import('./store')
    const { startGoogleSignIn, googleAccountSnapshot } = await import('./google-account')
    store.load()

    await startGoogleSignIn()
    expect(googleAccountSnapshot()).toEqual({ configured: false, signingIn: false, profile: null, error: null })
    expect(oauth.signInWithGoogle).not.toHaveBeenCalled()
    expect(store.active().orders).toEqual([])
  })
})
