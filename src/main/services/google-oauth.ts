import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { OAuth2Client } from 'google-auth-library'
import { z } from 'zod'
import type { AppLanguage, GoogleProfile } from '../../shared/types'

const loopback = '127.0.0.1'
const callbackPath = '/oauth/google'
const clientSchema = z.object({
  client_id: z.string().regex(/^[a-z\d-]+\.apps\.googleusercontent\.com$/),
  client_secret: z.string().min(1).optional()
})

type DesktopClient = z.infer<typeof clientSchema>

export function readGoogleClient(paths: string[]): DesktopClient | null {
  for (const path of paths) {
    try {
      const config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
      const result = clientSchema.safeParse(config?.installed)
      if (result.success) return result.data
    } catch {
      // Una instancia sin credenciales válidas sigue funcionando sin cuenta.
    }
  }
  return null
}

function openCallback(
  state: string,
  openBrowser: (redirect: URL) => Promise<void>,
  signal: AbortSignal,
  language: AppLanguage
): Promise<{ code: string; redirect: URL }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    let redirect: URL | undefined
    const server = createServer({ requestTimeout: 5_000, headersTimeout: 5_000, maxHeaderSize: 8192 })
    const abort = (): void => fail(signal.reason)
    const close = (): void => {
      signal.removeEventListener('abort', abort)
      server.close()
      server.closeAllConnections()
    }
    const fail = (error: unknown): void => {
      close()
      reject(error)
    }
    server.on('request', (req, res) => {
      const url = redirect && req.url ? URL.parse(req.url, redirect.origin) : null
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Connection', 'close')
      if (
        req.method !== 'GET' ||
        !redirect ||
        req.headers.host !== redirect.host ||
        url?.origin !== redirect.origin ||
        url.pathname !== callbackPath
      ) {
        res.writeHead(404).end(language === 'en' ? 'Page not found.' : 'Página no encontrada.')
        return
      }
      if (url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state) {
        res
          .writeHead(400)
          .end(
            language === 'en'
              ? 'This request does not match your OpenRoute sign-in.'
              : 'Esta solicitud no corresponde al inicio de sesión de OpenRoute.'
          )
        return
      }
      const [code, ...extras] = url.searchParams.getAll('code')
      if (url.searchParams.has('error') || !code || extras.length > 0) {
        res
          .writeHead(400)
          .end(
            language === 'en'
              ? 'Sign-in cancelled. Return to OpenRoute.'
              : 'Inicio de sesión cancelado. Vuelve a OpenRoute.',
            () => {
              fail(
                new Error(
                  language === 'en' ? 'Google did not complete sign-in.' : 'Google no completó el inicio de sesión.'
                )
              )
            }
          )
        return
      }
      const callback = { code, redirect }
      res.end(
        language === 'en'
          ? 'Request received. Return to OpenRoute to see the result.'
          : 'Solicitud recibida. Vuelve a OpenRoute para ver el resultado.',
        () => {
          close()
          resolve(callback)
        }
      )
    })
    server.once('error', () =>
      fail(
        new Error(
          language === 'en'
            ? 'Could not open the local connection for sign-in.'
            : 'No se pudo abrir la conexión local para iniciar sesión.'
        )
      )
    )
    signal.addEventListener('abort', abort, { once: true })
    server.listen(0, loopback, () => {
      const address = server.address()
      if (!address || typeof address === 'string')
        return fail(
          new Error(language === 'en' ? 'Could not open the local connection.' : 'No se pudo abrir la conexión local.')
        )
      redirect = new URL(`http://${loopback}:${address.port}${callbackPath}`)
      void openBrowser(redirect).catch(() =>
        fail(
          new Error(language === 'en' ? 'Could not open your browser.' : 'No se pudo abrir el navegador del sistema.')
        )
      )
    })
  })
}

export async function signInWithGoogle(
  config: DesktopClient,
  openBrowser: (url: string) => Promise<void>,
  cancel: AbortSignal,
  language: AppLanguage = 'es'
): Promise<GoogleProfile> {
  const verifier = randomBytes(32).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const signal = AbortSignal.any([cancel, AbortSignal.timeout(180_000)])
  const callback = await openCallback(
    state,
    async (redirect) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: redirect.href,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        hl: language,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        state,
        nonce
      }).toString()
      await openBrowser(url.href)
    },
    signal,
    language
  )

  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      body: new URLSearchParams({
        ...config,
        code: callback.code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: callback.redirect.href
      })
    })
    if (!token.ok) throw new Error()
    const { id_token } = z.object({ id_token: z.string().min(1) }).parse(await token.json())
    const client = new OAuth2Client({ transporterOptions: { timeout: 15_000, signal } })
    const ticket = await client.verifyIdToken({ idToken: id_token, audience: config.client_id })
    const profile = ticket.getPayload()
    if (!profile?.sub || profile.nonce !== nonce || profile.email_verified !== true || !profile.email) throw new Error()
    signal.throwIfAborted()
    return { name: profile.name?.trim() || profile.email, email: profile.email }
  } catch {
    signal.throwIfAborted()
    throw new Error(
      language === 'en'
        ? 'Could not verify your identity with Google. Try again.'
        : 'No se pudo verificar la identidad con Google. Vuelve a intentarlo.'
    )
  }
}
