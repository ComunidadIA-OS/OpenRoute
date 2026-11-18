import type { AppLanguage } from '@shared/types'
import { useUi } from '../store'
import { messages, type Message } from './messages'

const STORAGE_KEY = 'openroute:language'
const locales: Record<AppLanguage, string> = { es: 'es-ES', en: 'en' }

function restoreLanguage(): AppLanguage {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'en') return 'en'
  } catch {
    // El arranque sigue funcionando si el perfil impide usar el almacenamiento.
  }
  return 'es'
}

let lastLanguage = restoreLanguage()

export function rememberLanguage(language: AppLanguage): void {
  lastLanguage = language
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // La preferencia principal sigue en los ajustes de OpenRoute.
  }
}

function translator(language: AppLanguage) {
  const format = new Intl.NumberFormat(locales[language])
  return (key: Message, ...values: (string | number)[]): string => {
    const phrase = language === 'en' ? messages[key] : key
    return phrase.replace(/\{(\d+)\}/g, (_, index: string) => {
      const value = values[Number(index)]
      return typeof value === 'number' ? format.format(value) : (value ?? '')
    })
  }
}

const translations = { es: translator('es'), en: translator('en') }

const detailPatterns: [RegExp, Message][] = [
  [/^Falta la clave de (.+)\. Añádela en Ajustes\.$/, 'Falta la clave de {0}. Añádela en Ajustes.'],
  [/^No existe el vehículo (.+)\.$/, 'No existe el vehículo {0}.'],
  [/^No existe el pedido (.+) o no tiene ubicación\.$/, 'No existe el pedido {0} o no tiene ubicación.'],
  [/^(\d+) pedidos, (\d+) vehículos$/, '{0} pedidos, {1} vehículos'],
  [/^(\d+) pedidos en (\d+) rutas · (.+)$/, '{0} pedidos en {1} rutas · {2}'],
  [/^(\d+) pedidos$/, '{0} pedidos'],
  [/^(.+): (\d+) paradas · (.+)$/, '{0}: {1} paradas · {2}'],
  [/^(.+) actualizado$/, '{0} actualizado'],
  [/^(.+) añadido · sin ubicar$/, '{0} añadido · sin ubicar'],
  [/^(.+) añadido$/, '{0} añadido'],
  [/^(.+) quitado$/, '{0} quitado']
]

function translateDetail(language: AppLanguage, input: string): string {
  const text = input.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  if (language === 'es') return text
  if (Object.hasOwn(messages, text)) return translations.en(text as Message)
  for (const [pattern, message] of detailPatterns) {
    const match = pattern.exec(text)
    if (match) return translations.en(message, ...match.slice(1))
  }
  return text
}

const details = {
  es: (value: string): string => translateDetail('es', value),
  en: (value: string): string => translateDetail('en', value)
}

export function useI18n() {
  const language = useUi((state) => state.app?.settings.language ?? lastLanguage)
  return { t: translations[language], language, locale: locales[language], detail: details[language] }
}
