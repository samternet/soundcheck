import db, {
  deleteOpenSession,
  getOpenSession,
  listConnections,
  recordPlayEvent,
  upsertOpenSession,
  type OpenSession,
} from './db.js'
import { decrypt } from './crypto.js'
import {
  getActiveSessions,
  getItem,
  ticksToMs,
  TICKS_PER_MS,
  type JellyfinSession,
} from './jellyfin.js'

// Tracker design: poll Jellyfin frequently, keep exactly one live row per
// physical client session, and append one immutable play event per playback
// instance. The live row is updated in place; the history table is only written
// when a playback instance ends, changes track, or a genuine repeat is detected.
const POLL_MS = 5000
const MAX_DELTA_MS = 15000
const FINAL_GRACE_MS = 7000
const STALE_AFTER_MS = 15000
const SKIP_THRESHOLD_MS = 30000
const MIN_REPEAT_POSITION_MS = 5000
const REPEAT_END_WINDOW_MS = 10000
const MAX_PLAUSIBLE_START_SKEW_MS = 2 * 60 * 1000
const DOTNET_EPOCH_TICKS = 621355968000000000
/** Tolerance for clock jitter when crediting listening time between two polls. */
const POLL_JITTER_MS = 1500
/** A track shorter than this has no meaningful "near the end" window of its own. */
const SHORT_TRACK_REPEAT_MS = 60000
/** Fraction of a track that must be heard before it stops counting as a skip. */
const SKIP_RATIO = 0.25
/** Fraction of a track that counts as having finished it. */
const COMPLETION_RATIO = 0.9
/** Absolute slack allowed at the end of a track when judging completion. */
const COMPLETION_TAIL_MS = 15000
let running = false

function genresFor(item: any, fallback: string[] = []) {
  const values = Array.isArray(item?.Genres) ? item.Genres : fallback
  return [...new Set(values.map((x: unknown) => String(x).trim()).filter(Boolean))].join('|')
}

function sessionKey(serverId: string, s: JellyfinSession) {
  return `${serverId}:session:${s.sessionId}:${s.userId}`
}

function playbackStartMs(s: JellyfinSession) {
  const ticks = Number(s.playbackStartTimeTicks || 0)
  if (!Number.isFinite(ticks) || ticks <= DOTNET_EPOCH_TICKS) return 0
  const ms = Math.round((ticks - DOTNET_EPOCH_TICKS) / TICKS_PER_MS)
  const now = Date.now()
  return Math.abs(ms - now) <= MAX_PLAUSIBLE_START_SKEW_MS ? ms : 0
}

function makePlayInstanceId(
  physicalKey: string,
  s: JellyfinSession,
  startedAt: number,
  existing?: OpenSession,
  forceNew = false,
) {
  // A forced new instance must remain unique even if a Jellyfin client keeps
  // the same PlaySessionId and does not expose a new PlaybackStartTimeTicks.
  const uniqueSeed = forceNew ? Date.now() : startedAt
  if (s.playSessionId) return `${physicalKey}:play:${s.playSessionId}:${uniqueSeed}`
  if (!forceNew && existing?.play_instance_id) return existing.play_instance_id
  return `${physicalKey}:play:start:${uniqueSeed}`
}

function repeatByPosition(
  existing: OpenSession,
  observed: number,
  duration: number,
  isPaused: boolean,
) {
  if (isPaused) return false
  const previous = Number(existing.last_position_ms || 0)
  if (previous < MIN_REPEAT_POSITION_MS || observed > REPEAT_END_WINDOW_MS) return false
  if (duration <= 0) return previous >= SHORT_TRACK_REPEAT_MS
  const endWindow = Math.max(REPEAT_END_WINDOW_MS, Math.min(15000, duration * 0.05))
  return previous >= duration - endWindow
}

function playbackInstanceChanged(
  existing: OpenSession,
  s: JellyfinSession,
  observed: number,
  duration: number,
  now: number,
) {
  if (existing.item_id !== s.itemId) return true

  const observedStart = playbackStartMs(s)
  const existingStart = Number(existing.playback_start_time_ms || 0)

  // PlaybackStartTimeTicks is the strongest signal available from /Sessions.
  // A changed start time means Jellyfin started a new playback instance, even
  // when the item and PlaySessionId are unchanged (repeat-one is a key case).
  if (observedStart && existingStart && Math.abs(observedStart - existingStart) > 1000) return true

  // A new PlaySessionId is useful only when Jellyfin did not give us a reliable
  // start timestamp. Do not split a playback merely because a client reconnects.
  const observedPlaySession = String(s.playSessionId || '')
  const existingPlaySession = String(existing.jellyfin_play_session_id || '')
  if (
    !observedStart &&
    observedPlaySession &&
    existingPlaySession &&
    observedPlaySession !== existingPlaySession
  ) {
    if (repeatByPosition(existing, observed, duration, s.isPaused)) return true
    const elapsed = Math.max(0, now - Number(existing.last_seen_at || now))
    if (
      observed <= REPEAT_END_WINDOW_MS &&
      Number(existing.last_position_ms || 0) > 30000 &&
      elapsed <= 20000
    )
      return true
  }

  // Some clients keep both identifiers stable across Repeat One. Position reset
  // at the very end is the final fallback. This can classify a manual seek to
  // the beginning as a new play, but avoids silently losing genuine repeats.
  if (repeatByPosition(existing, observed, duration, s.isPaused)) return true

  return false
}

function accumulate(
  existing: OpenSession,
  position: number,
  duration: number,
  now: number,
  isPaused: boolean,
) {
  let accumulated = Number(existing.accumulated_ms || 0)
  if (existing.playback_state === 'playing' && !isPaused) {
    const delta = position - Number(existing.last_position_ms || 0)
    const elapsed = Math.max(0, now - Number(existing.last_seen_at || now))
    // min(position delta, wall-clock delta + a small jitter allowance). This
    // excludes seeks and protects against bogus jumps from a client.
    const allowed = Math.min(MAX_DELTA_MS, elapsed + POLL_JITTER_MS)
    if (delta > 0 && delta <= allowed) accumulated += Math.min(delta, elapsed + 1000)
  }
  if (duration > 0) accumulated = Math.min(accumulated, duration)
  return accumulated
}

function finalListenedMs(s: OpenSession, endedAt: number, finalPosition: number) {
  let listened = Math.max(0, Number(s.accumulated_ms || 0))
  if (s.playback_state === 'playing') {
    const elapsed = Math.max(0, endedAt - Number(s.last_seen_at || endedAt))
    if (elapsed > 0 && elapsed <= FINAL_GRACE_MS) listened += elapsed
    else {
      const delta = Math.max(0, finalPosition - Number(s.last_position_ms || 0))
      if (delta > 0 && delta <= MAX_DELTA_MS) listened += delta
    }
  }
  return s.track_duration_ms > 0 ? Math.min(listened, s.track_duration_ms) : listened
}

function finalize(
  s: OpenSession,
  endedAt: number,
  finalPosition: number,
  endReason: 'switch' | 'repeat' | 'stopped' | 'stale' | 'tracker_restart',
) {
  const listened = finalListenedMs(s, endedAt, finalPosition)
  const duration = Number(s.track_duration_ms || 0)
  const isSkip = duration > 0 && listened < Math.min(SKIP_THRESHOLD_MS, duration * SKIP_RATIO)
  const completed =
    duration > 0 && listened >= Math.max(duration * COMPLETION_RATIO, duration - COMPLETION_TAIL_MS)

  recordPlayEvent({
    connectionId: s.connection_id,
    userId: s.user_id,
    username: s.username,
    itemId: s.item_id,
    trackTitle: s.track_title,
    artistName: s.artist_name,
    albumName: s.album_name,
    genres: s.genres,
    startedAt: s.started_at,
    endedAt,
    listenedMs: listened,
    trackDurationMs: duration,
    isSkip,
    completed,
    endReason,
    deviceName: s.device_name || '',
    clientName: s.client_name || '',
    sessionKey: s.session_key,
    playInstanceId: s.play_instance_id || `${s.session_key}:play:${s.started_at}`,
    jellyfinPlaySessionId: s.jellyfin_play_session_id || '',
  })
  deleteOpenSession(s.session_key)
  console.log(
    `[tracker] finalized user=${s.username || s.user_id} track=${s.track_title || s.item_id}; reason=${endReason}; listened=${listened}ms; completed=${completed}`,
  )
}

function buildOpenSession(
  key: string,
  connectionId: string,
  s: JellyfinSession,
  tuple: { title: string; artist: string; album: string; genres: string; duration: number },
  now: number,
  existing?: OpenSession,
  forceNew = false,
) {
  const observedStart = playbackStartMs(s)
  const previousStart = Number(existing?.playback_start_time_ms || 0)
  const startMs = forceNew
    ? observedStart && observedStart !== previousStart
      ? observedStart
      : now
    : observedStart ||
      (existing?.started_at && existing.item_id === s.itemId ? existing.started_at : now)
  return {
    session_key: key,
    connection_id: connectionId,
    user_id: s.userId,
    username: s.username,
    item_id: s.itemId,
    track_title: tuple.title,
    artist_name: tuple.artist,
    album_name: tuple.album,
    genres: tuple.genres,
    track_duration_ms: tuple.duration,
    started_at: startMs,
    last_seen_at: now,
    last_position_ms: Math.max(0, Number(s.positionMs || 0)),
    accumulated_ms: 0,
    playback_state: s.isPaused ? ('paused' as const) : ('playing' as const),
    device_name: s.deviceName,
    client_name: s.clientName,
    play_instance_id: makePlayInstanceId(key, s, startMs, existing, forceNew),
    jellyfin_play_session_id: s.playSessionId || '',
    playback_start_time_ms: observedStart,
    playlist_item_id: s.playlistItemId || '',
    repeat_mode: s.repeatMode || 'RepeatNone',
  }
}

async function pollConnection(c: any) {
  let token: string
  try {
    token = decrypt(c.token_ciphertext, c.token_iv, c.token_tag)
  } catch {
    return
  }

  let current: JellyfinSession[]
  try {
    current = await getActiveSessions(c.server_url, token, c.device_id || undefined)
  } catch (e) {
    console.error(`[tracker] Jellyfin poll failed for ${c.server_url}:`, e)
    return
  }

  const now = Date.now()
  const seen = new Set<string>()
  const unique = new Map<string, JellyfinSession>()
  for (const s of current) {
    const key = sessionKey(c.server_id, s)
    const old = unique.get(key)
    if (!old || s.positionMs >= old.positionMs) unique.set(key, s)
  }

  for (const s of unique.values()) {
    const key = sessionKey(c.server_id, s)
    seen.add(key)
    let existing = getOpenSession(key)
    const observed = Math.max(0, Number(s.positionMs || 0))

    let metadata: any = null
    if (
      !existing ||
      existing.item_id !== s.itemId ||
      !existing.track_title ||
      !existing.artist_name ||
      !existing.album_name
    ) {
      metadata = await getItem(c.server_url, token, s.userId, s.itemId, c.device_id || undefined)
    }

    const title = String(metadata?.Name || s.trackTitle || '')
    const artist = String(metadata?.AlbumArtist || metadata?.Artists?.[0] || s.artist || '')
    const album = String(metadata?.Album || s.album || '')
    const duration = Math.max(Number(s.durationMs || 0), ticksToMs(metadata?.RunTimeTicks))
    const genres = genresFor(metadata, s.genres)
    const tuple = { title, artist, album, genres, duration }

    if (!existing) {
      upsertOpenSession(buildOpenSession(key, c.id, s, tuple, now))
      console.log(
        `[tracker] opened user=${s.username || s.userId} track=${tuple.title || s.itemId}`,
      )
      continue
    }

    if (playbackInstanceChanged(existing, s, observed, tuple.duration, now)) {
      const reason = existing.item_id !== s.itemId ? 'switch' : 'repeat'
      finalize(existing, now, existing.last_position_ms, reason)
      upsertOpenSession(buildOpenSession(key, c.id, s, tuple, now, existing, true))
      console.log(
        `[tracker] ${reason} user=${s.username || s.userId} track=${tuple.title || s.itemId}`,
      )
      continue
    }

    const accumulated = accumulate(existing, observed, tuple.duration, now, s.isPaused)
    const observedStart = playbackStartMs(s)
    upsertOpenSession({
      ...existing,
      track_title: tuple.title,
      artist_name: tuple.artist,
      album_name: tuple.album,
      genres: tuple.genres,
      track_duration_ms: tuple.duration,
      last_seen_at: now,
      last_position_ms: observed,
      accumulated_ms: accumulated,
      playback_state: s.isPaused ? ('paused' as const) : ('playing' as const),
      device_name: s.deviceName,
      client_name: s.clientName,
      jellyfin_play_session_id: s.playSessionId || existing.jellyfin_play_session_id || '',
      playback_start_time_ms: observedStart || existing.playback_start_time_ms || 0,
      playlist_item_id: s.playlistItemId || existing.playlist_item_id || '',
      repeat_mode: s.repeatMode || existing.repeat_mode || 'RepeatNone',
    })
  }

  const open = db
    .prepare('SELECT * FROM open_sessions WHERE connection_id=?')
    .all(c.id) as OpenSession[]
  for (const s of open) {
    if (!seen.has(s.session_key) && now - Number(s.last_seen_at || 0) >= STALE_AFTER_MS) {
      finalize(s, now, Number(s.last_position_ms || 0), 'stale')
    }
  }
}

export async function pollAll() {
  const connections = listConnections()
  await Promise.all(connections.map(c => pollConnection(c)))
}

async function trackerLoop() {
  if (!running) return
  try {
    await pollAll()
  } finally {
    if (running)
      setTimeout(() => {
        void trackerLoop()
      }, POLL_MS)
  }
}

export function startTracker() {
  if (running) return
  running = true
  void trackerLoop()
  console.log(`[tracker] database tracking enabled · Jellyfin /Sessions every ${POLL_MS / 1000}s`)
}
