// Un único punto para crear el modelo que haya elegido la persona.
// Claude, ChatGPT y Gemini con sus SDK oficiales del AI SDK; OpenRouter, Ollama
// y cualquier servidor compatible con la API de OpenAI por la vía compatible.

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { fetchJson } from '../services/http'
import { store } from '../store'
import type { ModelListResult, ModelRef, ProviderId } from '../../shared/types'
import { PROVIDERS } from '../../shared/types'

function baseURL(id: ProviderId): string {
  const p = PROVIDERS.find((x) => x.id === id)!
  return (store.state.settings.providers[id]?.baseURL || p.defaultBaseURL || '').replace(/\/$/, '')
}

function requireKey(id: ProviderId): string {
  const key = store.getSecret(id)
  if (!key) {
    const name = PROVIDERS.find((p) => p.id === id)?.name ?? id
    throw new Error(`Falta la clave de ${name}. Añádela en Ajustes.`)
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

/** Pide al proveedor la lista de modelos disponibles con esa clave. */
export async function listModels(id: ProviderId): Promise<ModelListResult> {
  const suggested = PROVIDERS.find((p) => p.id === id)?.suggested ?? []
  try {
    switch (id) {
      case 'anthropic': {
        const res = await fetchJson<{ data: { id: string }[] }>('https://api.anthropic.com/v1/models?limit=100', {
          headers: { 'x-api-key': requireKey('anthropic'), 'anthropic-version': '2023-06-01' }
        })
        return { models: res.data.map((m) => m.id) }
      }
      case 'openai': {
        const res = await fetchJson<{ data: { id: string }[] }>('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${requireKey('openai')}` }
        })
        const chat = res.data
          .map((m) => m.id)
          .filter(
            (m) => /^(gpt|o\d|chatgpt)/.test(m) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(m)
          )
        return { models: chat.sort().reverse() }
      }
      case 'google': {
        const res = await fetchJson<{ models: { name: string; supportedGenerationMethods?: string[] }[] }>(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(requireKey('google'))}`
        )
        return {
          models: res.models
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => m.name.replace(/^models\//, ''))
            .filter((m) => m.startsWith('gemini'))
        }
      }
      case 'openrouter': {
        const res = await fetchJson<{ data: { id: string; supported_parameters?: string[] }[] }>(
          'https://openrouter.ai/api/v1/models'
        )
        return { models: res.data.filter((m) => m.supported_parameters?.includes('tools')).map((m) => m.id) }
      }
      case 'ollama': {
        const res = await fetchJson<{ models: { name: string }[] }>(`${baseURL('ollama')}/api/tags`, {
          timeoutMs: 4000
        })
        return { models: res.models.map((m) => m.name) }
      }
      case 'custom': {
        const key = store.getSecret('custom')
        const res = await fetchJson<{ data: { id: string }[] }>(`${baseURL('custom')}/models`, {
          timeoutMs: 6000,
          headers: key ? { Authorization: `Bearer ${key}` } : {}
        })
        return { models: res.data.map((m) => m.id) }
      }
    }
  } catch (e) {
    return { models: suggested, error: e instanceof Error ? e.message : String(e) }
  }
}

export function modelLabel(ref: ModelRef | null): string {
  if (!ref) return 'Sin modelo'
  return ref.model
}
