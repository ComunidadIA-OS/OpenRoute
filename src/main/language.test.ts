import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectLanguage } from './language'

const electron = vi.hoisted(() => ({ profile: '', language: 'es-CO' }))
vi.mock('electron', () => ({
  app: { getPath: () => electron.profile, getPreferredSystemLanguages: () => [electron.language], isPackaged: false }
}))

beforeEach(() => {
  vi.resetModules()
  electron.profile = mkdtempSync(join(tmpdir(), 'openroute-language-'))
  electron.language = 'es-CO'
})

afterEach(() => rmSync(electron.profile, { recursive: true, force: true }))

describe('idioma inicial', () => {
  it('mantiene una preferencia guardada al reinstalar desde otra descarga', () => {
    expect(selectLanguage('es', 'en', 'en-US')).toBe('es')
    expect(selectLanguage('en', 'es', 'es-CO')).toBe('en')
  })

  it('usa el idioma de la descarga cuando aún no hay preferencia', () => {
    expect(selectLanguage(undefined, 'es', 'en-US')).toBe('es')
    expect(selectLanguage(undefined, 'en', 'es-CO')).toBe('en')
  })

  it('respeta la variante española del sistema y usa inglés para los demás idiomas', () => {
    expect(selectLanguage(null, 'fr', 'es-CO')).toBe('es')
    expect(selectLanguage('fr', null, 'en-GB')).toBe('en')
    expect(selectLanguage(null, null, 'fr-FR')).toBe('en')
  })

  it('persiste el idioma inicial del sistema y lo conserva al reiniciar en otro idioma', async () => {
    electron.language = 'en-GB'
    const { store } = await import('./store')
    store.load()
    expect(store.state.settings.language).toBe('en')
    expect(store.active().title).toMatch(/^Delivery plan for /)
    expect(JSON.parse(readFileSync(join(electron.profile, 'openroute.json'), 'utf8')).settings.language).toBe('en')
    electron.language = 'es-CO'
    vi.resetModules()
    const reopened = await import('./store')
    reopened.store.load()
    expect(reopened.store.state.settings.language).toBe('en')
  })

  it('completa el idioma de un perfil antiguo y conserva sus ajustes', async () => {
    const path = join(electron.profile, 'openroute.json')
    writeFileSync(path, JSON.stringify({ version: 1, settings: { countryCodes: 'co', serviceMin: 11 } }))
    const { store } = await import('./store')
    store.load()
    expect(store.state.settings).toMatchObject({ language: 'es', countryCodes: 'co', serviceMin: 11 })
    expect(JSON.parse(readFileSync(path, 'utf8')).settings.language).toBe('es')
  })

  it('inicia un reparto vacío y permite buscar direcciones en cualquier país', async () => {
    const { store } = await import('./store')
    store.load()
    expect(store.state.settings.countryCodes).toBe('')
    expect(store.state.depot).toBeNull()
    expect(store.state.vehicles).toEqual([])
    expect(store.active()).toMatchObject({ orders: [], plan: null })
  })
})
