import type { AppLanguage } from '../shared/types'

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'es' || value === 'en'
}

export function selectLanguage(saved: unknown, installer: unknown, system: string): AppLanguage {
  if (isAppLanguage(saved)) return saved
  if (isAppLanguage(installer)) return installer
  return /^es(?:[-_]|$)/i.test(system) ? 'es' : 'en'
}
