import { store } from './store'

export function ui(es: string, en: string): string {
  return store.state.settings.language === 'en' ? en : es
}
