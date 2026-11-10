// fetch con tiempo límite y un User-Agent genérico (los servicios de
// OpenStreetMap piden identificar la aplicación, no a la persona).

export const USER_AGENT = 'OpenRoute-Desktop (+https://github.com/ComunidadIA-OS/OpenRoute)'

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 10_000, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(rest.headers ?? {}) }
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}
