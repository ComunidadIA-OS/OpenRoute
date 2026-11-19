import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import type { LocalCliAction, LocalCliId } from '../../shared/local-cli'

const exec = promisify(execFile)

function localDirectory(value: string | undefined): value is string {
  return value !== undefined && /^[a-z]:[\\/]/i.test(value)
}

export function windowsCliCandidates(id: LocalCliId, env: NodeJS.ProcessEnv): string[] {
  const local = env.LOCALAPPDATA
  const home = env.USERPROFILE
  const programFiles = env.ProgramFiles
  const defaults = {
    codex: localDirectory(local) ? [win32.join(local, 'Programs', 'OpenAI', 'Codex', 'bin')] : [],
    agy: [
      ...(localDirectory(local) ? [win32.join(local, 'agy', 'bin')] : []),
      ...(localDirectory(programFiles) ? [win32.join(programFiles, 'Google', 'antigravity-cli')] : [])
    ],
    claude: localDirectory(home) ? [win32.join(home, '.local', 'bin')] : []
  }
  const path = (env.PATH ?? env.Path ?? '').split(';').map((part) => part.trim().replace(/^"(.*)"$/, '$1'))
  const seen = new Set<string>()
  return [...defaults[id], ...path].filter(localDirectory).flatMap((directory) => {
    const candidate = win32.join(directory, `${id}.exe`)
    const key = candidate.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [candidate]
  })
}

export async function findWindowsCli(id: LocalCliId, env = process.env): Promise<string | undefined> {
  for (const file of windowsCliCandidates(id, env)) {
    if ((await stat(file).catch(() => null))?.isFile()) return file
  }
  return undefined
}

// PowerShell recibe rutas por entorno y nunca evalúa texto procedente de la app.
const launchScript = [
  "$ErrorActionPreference = 'Stop'",
  '$bin = $env:OPENROUTE_CLI_BINARY',
  '$directory = $env:OPENROUTE_CLI_DIRECTORY',
  'Remove-Item Env:OPENROUTE_CLI_BINARY, Env:OPENROUTE_CLI_DIRECTORY'
].join('; ')

const loginArgs: Record<LocalCliId, string> = {
  codex: 'login',
  claude: 'auth login',
  agy: ''
}

export function windowsCliLaunchScript(id: LocalCliId, action: LocalCliAction, includeSummary: boolean): string {
  const prompt = '"Read resumen.txt and follow the instructions in it."'
  const args =
    action === 'sign-in'
      ? loginArgs[id]
      : includeSummary
        ? `${id === 'agy' ? '--prompt-interactive ' : ''}${prompt}`
        : ''
  const start = 'Start-Process -FilePath $bin -WorkingDirectory $directory'
  return `${launchScript}; ${start}${args ? ` -ArgumentList '${args}'` : ''}`
}

function subscriptionEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keys = new Set([
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'AGY_API_KEY',
    'AGY_ADC_AUTH',
    'OPENROUTE_CLI_BINARY',
    'OPENROUTE_CLI_DIRECTORY'
  ])
  return Object.fromEntries(Object.entries(env).filter(([key]) => !keys.has(key.toUpperCase())))
}

export function windowsCliEnvironment(env: NodeJS.ProcessEnv, binary: string, directory: string): NodeJS.ProcessEnv {
  return {
    ...subscriptionEnvironment(env),
    OPENROUTE_CLI_BINARY: binary,
    OPENROUTE_CLI_DIRECTORY: directory
  }
}

export async function windowsCliSignedIn(
  id: LocalCliId,
  binary: string,
  directory: string,
  env = process.env
): Promise<boolean | undefined> {
  if (id === 'agy') return undefined
  const args = id === 'codex' ? ['login', 'status'] : ['auth', 'status']
  try {
    const { stdout, stderr } = await exec(binary, args, {
      cwd: directory,
      env: subscriptionEnvironment(env),
      windowsHide: true,
      timeout: 3_000,
      maxBuffer: 16_384
    })
    if (id === 'codex') return /Logged in using ChatGPT/i.test(`${stdout}\n${stderr}`)
    const status: { loggedIn?: boolean; authMethod?: string } = JSON.parse(stdout)
    return status.loggedIn === true && status.authMethod === 'claude.ai'
  } catch {
    return undefined
  }
}

export async function launchWindowsCli(
  binary: string,
  directory: string,
  id: LocalCliId,
  action: LocalCliAction,
  includeSummary: boolean,
  env = process.env
): Promise<void> {
  const root = env.SystemRoot ?? env.SYSTEMROOT
  if (!localDirectory(root)) throw new Error('No se encontró la ubicación de Windows.')
  const powerShell = win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await exec(
    powerShell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsCliLaunchScript(id, action, includeSummary)],
    {
      cwd: directory,
      env: windowsCliEnvironment(env, binary, directory),
      windowsHide: true,
      timeout: 10_000
    }
  )
}
