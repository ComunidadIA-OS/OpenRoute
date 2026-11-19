export const LOCAL_CLIS = [
  {
    id: 'codex',
    name: 'ChatGPT (Codex)',
    signIn: 'Si es tu primera vez, inicia sesión con ChatGPT en tu navegador.',
    installUrl: 'https://developers.openai.com/codex/cli'
  },
  {
    id: 'claude',
    name: 'Claude (Claude Code)',
    signIn: 'Si es tu primera vez, inicia sesión con Claude en tu navegador.',
    installUrl: 'https://code.claude.com/docs/en/setup'
  },
  {
    id: 'agy',
    name: 'Google (Antigravity)',
    signIn: 'Si Antigravity te pide iniciar sesión, elige tu cuenta de Google.',
    installUrl: 'https://antigravity.google/docs/getting-started?tab=cli'
  }
] as const

export type LocalCliId = (typeof LOCAL_CLIS)[number]['id']
export type LocalCliAction = 'open' | 'sign-in'

export interface LocalCliStatus {
  id: LocalCliId
  installed: boolean
  signedIn?: boolean
}

export type LocalCliList = { supported: false } | { supported: true; clients: LocalCliStatus[] }
export type LocalCliLaunch = { ok: true } | { ok: false; error: string }
