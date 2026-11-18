import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import type { LocalCliId } from '../../shared/local-cli'

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
  'Remove-Item Env:OPENROUTE_CLI_BINARY, Env:OPENROUTE_CLI_DIRECTORY',
  'Start-Process -FilePath $bin -WorkingDirectory $directory'
].join('; ')

export function windowsCliEnvironment(env: NodeJS.ProcessEnv, binary: string, directory: string): NodeJS.ProcessEnv {
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
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => !keys.has(key.toUpperCase()))),
    OPENROUTE_CLI_BINARY: binary,
    OPENROUTE_CLI_DIRECTORY: directory
  }
}

export async function launchWindowsCli(binary: string, directory: string, env = process.env): Promise<void> {
  const root = env.SystemRoot ?? env.SYSTEMROOT
  if (!localDirectory(root)) throw new Error('No se encontró la ubicación de Windows.')
  const powerShell = win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await exec(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', launchScript], {
    cwd: directory,
    env: windowsCliEnvironment(env, binary, directory),
    windowsHide: true,
    timeout: 10_000
  })
}
