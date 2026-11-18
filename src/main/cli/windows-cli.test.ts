import { describe, expect, it } from 'vitest'
import { windowsCliCandidates, windowsCliEnvironment } from './windows-cli'

describe('detecta los terminales de Windows', () => {
  const env = {
    LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\Ana',
    ProgramFiles: 'C:\\Program Files',
    Path: String.raw`;"D:\Programas de Ana";d:\programas de ana;.;\\server\share;D:relativa`
  }

  it('prioriza las rutas nativas de los instaladores oficiales', () => {
    expect(windowsCliCandidates('codex', env)[0]).toBe(
      'C:\\Users\\Ana\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe'
    )
    expect(windowsCliCandidates('agy', env).slice(0, 2)).toEqual([
      'C:\\Users\\Ana\\AppData\\Local\\agy\\bin\\agy.exe',
      'C:\\Program Files\\Google\\antigravity-cli\\agy.exe'
    ])
    expect(windowsCliCandidates('claude', env)[0]).toBe('C:\\Users\\Ana\\.local\\bin\\claude.exe')
  })

  it('solo considera ejecutables locales y absolutos y deduplica el PATH', () => {
    expect(windowsCliCandidates('claude', { Path: env.Path })).toEqual(['D:\\Programas de Ana\\claude.exe'])
  })
})

describe('entorno del terminal', () => {
  it('conserva la configuración local y excluye las claves de modelos', () => {
    const result = windowsCliEnvironment(
      {
        Path: 'C:\\Tools',
        LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local',
        openai_api_key: 'prueba',
        ANTHROPIC_API_KEY: 'prueba',
        CLAUDE_CODE_OAUTH_TOKEN: 'prueba',
        GEMINI_API_KEY: 'prueba',
        AGY_ADC_AUTH: 'true',
        openroute_cli_directory: 'C:\\Directorio anterior'
      },
      'C:\\Tools\\agy.exe',
      'C:\\Temp\\OpenRoute-agy'
    )
    expect(result).toEqual({
      Path: 'C:\\Tools',
      LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local',
      OPENROUTE_CLI_BINARY: 'C:\\Tools\\agy.exe',
      OPENROUTE_CLI_DIRECTORY: 'C:\\Temp\\OpenRoute-agy'
    })
  })
})
