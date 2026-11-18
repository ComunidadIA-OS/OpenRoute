export const LOCAL_CLIS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    signIn: 'Elige «Iniciar sesión con ChatGPT» en el terminal.',
    installUrl: 'https://developers.openai.com/codex/cli'
  },
  {
    id: 'agy',
    name: 'Antigravity CLI (agy)',
    signIn: 'Sigue el inicio de sesión con Google en el terminal.',
    installUrl: 'https://antigravity.google/docs/cli/tutorial/'
  },
  {
    id: 'claude',
    name: 'Claude Code',
    signIn: 'Inicia sesión en Claude Code con tu cuenta de Claude.',
    installUrl: 'https://code.claude.com/docs/en/setup'
  }
] as const

export type LocalCliId = (typeof LOCAL_CLIS)[number]['id']

export interface LocalCliStatus {
  id: LocalCliId
  installed: boolean
}

export type LocalCliList = { supported: false } | { supported: true; clients: LocalCliStatus[] }
export type LocalCliLaunch = { ok: true } | { ok: false; error: string }
