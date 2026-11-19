// Un único punto para crear el modelo que haya elegido la persona.
// Claude, ChatGPT y Gemini con sus SDK oficiales del AI SDK; OpenRouter, Ollama
// y cualquier servidor compatible con la API de OpenAI por la vía compatible.

import { ui } from '../ui-language'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { store } from '../store'
import type { ModelRef, ProviderId } from '../../shared/types'
import { PROVIDERS } from '../../shared/types'

function baseURL(id: ProviderId): string {
  const p = PROVIDERS.find((x) => x.id === id)!
  return (store.state.settings.providers[id]?.baseURL || p.defaultBaseURL || '').replace(/\/$/, '')
}

function requireKey(id: ProviderId): string {
  const key = store.getSecret(id)
  if (!key) {
    const name = PROVIDERS.find((p) => p.id === id)?.name ?? id
    throw new Error(
      ui(`Falta la clave de ${name}. Añádela en Ajustes.`, `The ${name} key is missing. Add it in Settings.`)
    )
  }
  return key
}

export function createModel(ref: ModelRef): LanguageModel {
  switch (ref.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: requireKey('anthropic') })(ref.model)
    case 'openai':
      return createOpenAI({ apiKey: requireKey('openai') })(ref.model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: requireKey('google') })(ref.model)
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: requireKey('openrouter'),
        headers: { 'X-Title': 'OpenRoute' }
      })(ref.model)
    case 'ollama':
      return createOpenAICompatible({ name: 'ollama', baseURL: `${baseURL('ollama')}/v1` })(ref.model)
    case 'custom':
      return createOpenAICompatible({
        name: 'custom',
        baseURL: baseURL('custom'),
        apiKey: store.getSecret('custom')
      })(ref.model)
  }
}
