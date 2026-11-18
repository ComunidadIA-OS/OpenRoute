import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readGoogleClient, signInWithGoogle } from './google-oauth'

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }))
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken
  }
}))

const client = { client_id: '123-xyz.apps.googleusercontent.com' }
const fetchLoopback = fetch

afterEach(() => {
  vi.unstubAllGlobals()
  verifyIdToken.mockReset()
})

describe('readGoogleClient', () => {
  it('acepta solo un cliente instalable y descarta los endpoints del archivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openroute-google-'))
    try {
      const web = join(dir, 'web.json')
      const desktop = join(dir, 'desktop.json')
      writeFileSync(web, JSON.stringify({ web: client }))
      writeFileSync(desktop, JSON.stringify({ installed: { ...client, token_uri: 'https://no-usar.example' } }))
      expect(readGoogleClient([web])).toBeNull()
      expect(readGoogleClient([web, desktop])).toEqual(client)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('signInWithGoogle', () => {
  it('acepta solo el callback de su estado, intercambia el código con PKCE y devuelve identidad sin tokens', async () => {
    let authorization: URL
    const tokenFetch = vi.fn(async () => Response.json({ id_token: 'token-firmado', access_token: 'temporal' }))
    vi.stubGlobal('fetch', tokenFetch)
    const verify = vi.fn(() => ({
      sub: '123',
      nonce: authorization.searchParams.get('nonce'),
      email_verified: true,
      email: 'ana@example.org',
      name: 'Ana'
    }))
    verifyIdToken.mockResolvedValue({ getPayload: verify })

    const result = await signInWithGoogle(
      client,
      async (url) => {
        authorization = new URL(url)
        const redirect = new URL(authorization.searchParams.get('redirect_uri')!)
        expect(authorization.searchParams.get('hl')).toBe('en')
        expect(authorization.origin).toBe('https://accounts.google.com')
        expect(authorization.searchParams.get('scope')).toBe('openid email profile')
        expect(authorization.searchParams.get('access_type')).toBe('online')
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
        expect(redirect.hostname).toBe('127.0.0.1')
        redirect.search = 'code=ignorado&state=otro'
        expect((await fetchLoopback(redirect)).status).toBe(400)
        expect(tokenFetch).not.toHaveBeenCalled()
        redirect.searchParams.set('code', 'codigo-aceptado')
        redirect.searchParams.set('state', authorization.searchParams.get('state')!)
        const received = await fetchLoopback(redirect)
        expect(received.status).toBe(200)
        expect(await received.text()).toContain('Return to OpenRoute')
      },
      new AbortController().signal,
      'en'
    )

    const [endpoint, options] = tokenFetch.mock.calls[0] as unknown as [string, { body: URLSearchParams }]
    expect(endpoint).toBe('https://oauth2.googleapis.com/token')
    expect(options.body.get('code')).toBe('codigo-aceptado')
    expect(options.body.get('redirect_uri')).toBe(authorization!.searchParams.get('redirect_uri'))
    expect(createHash('sha256').update(options.body.get('code_verifier')!).digest('base64url')).toBe(
      authorization!.searchParams.get('code_challenge')
    )
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token-firmado', audience: client.client_id })
    expect(result).toEqual({ name: 'Ana', email: 'ana@example.org' })
  })

  it('rechaza un ID token verificado que pertenece a otra solicitud', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id_token: 'token-firmado' }))
    )
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: '123', nonce: 'otro', email_verified: true, email: 'ana@example.org' })
    })
    await expect(
      signInWithGoogle(
        client,
        async (url) => {
          const authorization = new URL(url)
          const redirect = new URL(authorization.searchParams.get('redirect_uri')!)
          redirect.searchParams.set('code', 'codigo')
          redirect.searchParams.set('state', authorization.searchParams.get('state')!)
          await fetchLoopback(redirect)
        },
        new AbortController().signal
      )
    ).rejects.toThrow('No se pudo verificar la identidad')
  })

  it('cierra el puerto de la red local cuando se cancela', async () => {
    const controller = new AbortController()
    let redirect: URL | undefined
    await expect(
      signInWithGoogle(
        client,
        async (url) => {
          redirect = new URL(new URL(url).searchParams.get('redirect_uri')!)
          controller.abort()
        },
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(fetchLoopback(redirect!)).rejects.toThrow()
    expect(verifyIdToken).not.toHaveBeenCalled()
  })
})
