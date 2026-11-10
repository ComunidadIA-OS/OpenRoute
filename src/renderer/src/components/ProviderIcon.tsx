// Iconos de proveedores: @lobehub/icons-static-svg (MIT). Ver NOTICE.
import claude from '../assets/providers/claude-color.svg?raw'
import gemini from '../assets/providers/gemini-color.svg?raw'
import lmstudio from '../assets/providers/lmstudio.svg?raw'
import ollama from '../assets/providers/ollama.svg?raw'
import openai from '../assets/providers/openai.svg?raw'
import openrouter from '../assets/providers/openrouter.svg?raw'
import type { ProviderId } from '@shared/types'

const clean = (svg: string): string => svg.replace(/ style="[^"]*"/g, '').replace(/<title>.*?<\/title>/, '')

const ICONS: Record<ProviderId, string> = {
  anthropic: clean(claude),
  openai: clean(openai),
  google: clean(gemini),
  openrouter: clean(openrouter),
  ollama: clean(ollama),
  custom: clean(lmstudio)
}

export function ProviderIcon({ id, size = 16, className = '' }: { id: ProviderId; size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[id] }}
    />
  )
}
