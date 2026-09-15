/**
 * The single place that knows how to talk to the Sound Capsule API.
 *
 * Before this existed, all 24 call sites repeated the session header name, the
 * `r.json()` / `r.ok` dance and their own ad-hoc error handling, so a change to
 * any of it meant editing every page. Components now call `api.get(...)` and
 * deal only with data.
 */

/** Header carrying the web session id. Must match SESSION_HEADER in server/src/config.ts. */
export const SESSION_HEADER = 'x-capsule-session'

export const API_BASE = '/api'

/** Thrown for any non-2xx response, carrying the server's own message when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  /** Session id to authenticate as; omitted for the public login endpoints. */
  sessionId?: string
  /** JSON body — sets the method to POST and the content type automatically. */
  body?: unknown
  method?: 'GET' | 'POST'
  signal?: AbortSignal
  /** Bypass the HTTP cache, for endpoints polled for freshness. */
  noStore?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { sessionId, body, method, signal, noStore } = options
  const headers: Record<string, string> = {}
  if (sessionId) headers[SESSION_HEADER] = sessionId
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(path, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: noStore ? 'no-store' : undefined,
  })

  // Some endpoints answer with an empty body (logout, artwork probes); treat a
  // failed parse on an otherwise-fine response as "no content" rather than an error.
  let data: any = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `Request failed (${response.status})`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...options, body: body ?? {}, method: 'POST' }),
  /**
   * Same as `get`, but resolves to null instead of throwing. For the several
   * call sites whose only error handling was an empty `catch {}`.
   */
  async tryGet<T>(
    path: string,
    options?: Omit<RequestOptions, 'body' | 'method'>,
  ): Promise<T | null> {
    try {
      return await request<T>(path, options)
    } catch {
      return null
    }
  },
}

/** Endpoint paths, so a route rename is a one-line change here. */
export const endpoints = {
  login: `${API_BASE}/auth/login`,
  logout: `${API_BASE}/auth/logout`,
  me: `${API_BASE}/auth/me`,
  serverInfo: `${API_BASE}/server/info`,
  serverUrls: `${API_BASE}/server/urls`,
  syncNow: `${API_BASE}/sync/now`,
  unlockOverride: `${API_BASE}/settings/unlock-override`,
  mediaBatch: `${API_BASE}/media/batch`,
  dashboard: (year: number) => `${API_BASE}/dashboard?year=${year}`,
  media: (itemId: string) => `${API_BASE}/media/${encodeURIComponent(itemId)}`,
  mediaResolve: (type: 'MusicArtist' | 'MusicAlbum', name: string, artist?: string) =>
    `${API_BASE}/media/resolve?type=${type}&name=${encodeURIComponent(name)}` +
    (artist ? `&artist=${encodeURIComponent(artist)}` : ''),
  song: (itemId: string, year: number) =>
    `${API_BASE}/song/${encodeURIComponent(itemId)}?year=${year}`,
  songFavorite: (itemId: string) => `${API_BASE}/song/${encodeURIComponent(itemId)}/favorite`,
  artist: (name: string, year: number) =>
    `${API_BASE}/artist/${encodeURIComponent(name)}?year=${year}`,
  album: (name: string, year: number, artist?: string) =>
    `${API_BASE}/album/${encodeURIComponent(name)}?year=${year}&artist=${encodeURIComponent(artist || '')}`,
}
