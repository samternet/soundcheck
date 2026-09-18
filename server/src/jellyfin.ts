import { APP_NAME, JELLYFIN_TIMEOUT_MS, VERSION } from './config.js'
import { trustUserId, type AuthedUserId } from './session-types.js'

/**
 * Jellyfin reports every duration and position in .NET ticks (100-nanosecond
 * units), so anything read off an item or PlayState is divided by this to reach
 * milliseconds.
 */
export const TICKS_PER_MS = 10_000

export const ticksToMs = (ticks: unknown) => Math.round(Number(ticks || 0) / TICKS_PER_MS)

/** Metadata fields requested when reading a single item or a batch of them. */
const ITEM_FIELDS =
  'Genres,Artists,ArtistItems,AlbumArtist,Album,AlbumId,RunTimeTicks,ImageTags,BackdropImageTags'
/** Search results only need enough to identify and illustrate a match. */
const SEARCH_FIELDS =
  'ImageTags,AlbumArtist,Artists,ArtistItems,AlbumId,ProductionYear,PremiereDate'
const SEARCH_LIMIT = 10
/** Jellyfin rejects an over-long Ids list, so batch lookups are chunked to this. */
const MAX_BATCH_IDS = 100

export type JellyfinSession = {
  sessionId: string
  playSessionId: string
  playbackStartTimeTicks: number
  playlistItemId: string
  repeatMode: string
  userId: AuthedUserId
  username: string
  itemId: string
  trackTitle: string
  album: string
  artist: string
  durationMs: number
  positionMs: number
  isPaused: boolean
  deviceId: string
  deviceName: string
  clientName: string
  genres: string[]
}

export function normalizeUrl(value: string) {
  let url = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  return url
}

// Every Soundcheck login used to send the exact same DeviceId to Jellyfin, so a
// second login (a different browser, or the same user from another network) looked
// to Jellyfin like the *same* device re-authenticating — which could invalidate the
// access token an already-open Soundcheck tab was still relying on. Callers now
// pass a per-connection/per-session deviceId (see db.ts's connections.device_id and
// web_sessions.device_id); the constant below is only a last-resort fallback for any
// call site that doesn't have one yet, so this stays backward-compatible.
const FALLBACK_DEVICE_ID = 'soundcheck'

/** Strips the characters that would break out of a quoted MediaBrowser header field. */
const headerValue = (value: string) => value.replace(/["\\,\r\n]/g, '')

/**
 * Identifies Soundcheck to Jellyfin using the standard `Authorization` header.
 *
 * Client details used to travel in `X-Emby-Authorization`, with the token in a
 * separate bare `Authorization: MediaBrowser Token="…"`. Newer Jellyfin releases
 * disable those legacy Emby headers by default, so the client fields were
 * ignored — and AuthenticateByName, which has no token yet, reached the server
 * with no usable authorization at all and was rejected. Every Jellyfin release
 * accepts the combined form below, so a single header works old and new alike.
 */
export function authHeaders(token?: string, deviceId?: string) {
  const fields = [
    `Client="${headerValue(APP_NAME)}"`,
    'Device="Web"',
    `DeviceId="${headerValue(deviceId || FALLBACK_DEVICE_ID)}"`,
    `Version="${headerValue(VERSION)}"`,
  ]
  if (token) fields.push(`Token="${headerValue(token)}"`)
  return {
    Accept: 'application/json',
    Authorization: `MediaBrowser ${fields.join(', ')}`,
  }
}

async function json(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    signal: init.signal || AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Jellyfin HTTP ${res.status}`)
  return res.json() as Promise<any>
}

export async function authenticate(
  serverUrl: string,
  username: string,
  password: string,
  deviceId?: string,
) {
  const url = normalizeUrl(serverUrl)
  const data = await json(`${url}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { ...authHeaders(undefined, deviceId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Pw: password }),
  })
  if (!data.AccessToken || !data.User?.Id)
    throw new Error('Jellyfin returned an incomplete authentication response')
  return { url, token: String(data.AccessToken), user: data.User }
}

export async function systemInfo(url: string, token: string, deviceId?: string) {
  return json(`${normalizeUrl(url)}/System/Info`, { headers: authHeaders(token, deviceId) })
}

export async function getUser(url: string, token: string, userId: string, deviceId?: string) {
  try {
    return await json(`${normalizeUrl(url)}/Users/${encodeURIComponent(userId)}`, {
      headers: authHeaders(token, deviceId),
    })
  } catch {
    return null
  }
}

export async function getActiveSessions(
  url: string,
  token: string,
  deviceId?: string,
): Promise<JellyfinSession[]> {
  const data = await json(`${normalizeUrl(url)}/Sessions`, {
    headers: authHeaders(token, deviceId),
  })
  return (Array.isArray(data) ? data : [])
    .filter(s => s.NowPlayingItem?.Type === 'Audio')
    .map(s => ({
      sessionId: String(s.Id || ''),
      playSessionId: String(s.PlayState?.PlaySessionId || s.PlaySessionId || ''),
      playbackStartTimeTicks: Number(s.PlayState?.PlaybackStartTimeTicks || 0),
      playlistItemId: String(s.PlayState?.PlaylistItemId || ''),
      repeatMode: String(s.PlayState?.RepeatMode || 'RepeatNone'),
      // Trusted here because it comes straight from Jellyfin's own /Sessions
      // response, not from anything a Soundcheck browser client can influence.
      userId: trustUserId(String(s.UserId || '')),
      username: String(s.UserName || ''),
      itemId: String(s.NowPlayingItem?.Id || ''),
      trackTitle: String(s.NowPlayingItem?.Name || ''),
      album: String(s.NowPlayingItem?.Album || ''),
      artist: String(s.NowPlayingItem?.AlbumArtist || s.NowPlayingItem?.Artists?.[0] || ''),
      durationMs: ticksToMs(s.NowPlayingItem?.RunTimeTicks),
      positionMs: ticksToMs(s.PlayState?.PositionTicks),
      isPaused: Boolean(s.PlayState?.IsPaused),
      deviceId: String(s.DeviceId || ''),
      deviceName: String(s.DeviceName || ''),
      clientName: String(s.Client || ''),
      genres: Array.isArray(s.NowPlayingItem?.Genres) ? s.NowPlayingItem.Genres.map(String) : [],
    }))
    .filter(s => s.sessionId && s.itemId)
}

export async function searchItems(
  url: string,
  token: string,
  userId: string,
  term: string,
  type: 'MusicArtist' | 'MusicAlbum' | 'Audio',
  deviceId?: string,
): Promise<any[]> {
  const params = new URLSearchParams({
    UserId: userId,
    SearchTerm: term,
    Recursive: 'true',
    IncludeItemTypes: type,
    Fields: SEARCH_FIELDS,
    Limit: String(SEARCH_LIMIT),
  })
  try {
    const data = await json(
      `${normalizeUrl(url)}/Users/${encodeURIComponent(userId)}/Items?${params.toString()}`,
      { headers: authHeaders(token, deviceId) },
    )
    return Array.isArray(data?.Items) ? data.Items : []
  } catch {
    return []
  }
}

export async function getItemsByIds(
  url: string,
  token: string,
  userId: string,
  itemIds: string[],
  deviceId?: string,
): Promise<any[]> {
  const ids = [...new Set(itemIds.map(String).filter(Boolean))].slice(0, MAX_BATCH_IDS)
  if (!ids.length) return []
  const params = new URLSearchParams({
    UserId: userId,
    Ids: ids.join(','),
    // UserData carries IsFavorite, which the batch endpoint surfaces per item.
    Fields: `${ITEM_FIELDS},UserData`,
  })
  try {
    const data = await json(
      `${normalizeUrl(url)}/Users/${encodeURIComponent(userId)}/Items?${params.toString()}`,
      { headers: authHeaders(token, deviceId) },
    )
    return Array.isArray(data?.Items) ? data.Items : []
  } catch {
    return []
  }
}

export async function getItem(
  url: string,
  token: string,
  userId: string,
  itemId: string,
  deviceId?: string,
): Promise<any | null> {
  try {
    return await json(
      `${normalizeUrl(url)}/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?Fields=${ITEM_FIELDS}`,
      { headers: authHeaders(token, deviceId) },
    )
  } catch {
    return null
  }
}

export async function getItemUserData(
  url: string,
  token: string,
  itemId: string,
  deviceId?: string,
) {
  // UserItems/{itemId}/UserData is scoped to the authenticated Jellyfin user.
  // Do not use the administrator connection token when reading a user's
  // favorite state.
  return json(`${normalizeUrl(url)}/UserItems/${encodeURIComponent(itemId)}/UserData`, {
    headers: authHeaders(token, deviceId),
  })
}

export async function markFavoriteItem(
  url: string,
  token: string,
  itemId: string,
  deviceId?: string,
) {
  return json(`${normalizeUrl(url)}/UserFavoriteItems/${encodeURIComponent(itemId)}`, {
    method: 'POST',
    headers: authHeaders(token, deviceId),
  })
}

export async function unmarkFavoriteItem(
  url: string,
  token: string,
  itemId: string,
  deviceId?: string,
) {
  return json(`${normalizeUrl(url)}/UserFavoriteItems/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: authHeaders(token, deviceId),
  })
}
