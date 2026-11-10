import type { OpenRouteApi } from '../shared/types'

declare global {
  interface Window {
    openroute: OpenRouteApi
  }
}

export {}
