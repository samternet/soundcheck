import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import {
  ADMIN_DEVICE_ID_PREFIX,
  DATABASE_FILE,
  DATA_DIR,
  DEVICE_ID_PREFIX,
  MIN_YEAR,
} from './config.js'
import type { AuthedUserId } from './session-types.js'

export type OpenSession = {
  session_key: string
  connection_id: string
  user_id: AuthedUserId
  username: string
  item_id: string
  track_title: string
  artist_name: string
  album_name: string
  genres: string
  track_duration_ms: number
  started_at: number
  last_seen_at: number
  last_position_ms: number
  accumulated_ms: number
  playback_state: 'playing' | 'paused'
  play_instance_id?: string
  jellyfin_play_session_id?: string
  playback_start_time_ms?: number
  playlist_item_id?: string
  repeat_mode?: string
  device_name?: string
  client_name?: string
}

fs.mkdirSync(DATA_DIR, { recursive: true })
const db = new Database(DATABASE_FILE)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/** Bytes of randomness in a generated Jellyfin DeviceId suffix. */
const DEVICE_ID_BYTES = 8
const newDeviceId = (prefix: string) =>
  `${prefix}-${crypto.randomBytes(DEVICE_ID_BYTES).toString('hex')}`

/**
 * Idempotent additive migration. SQLite has no `ADD COLUMN IF NOT EXISTS`, and
 * this file previously mixed two idioms for the same job — a PRAGMA table_info
 * lookup in some places and a bare `try { … } catch {}` in others. One helper
 * keeps every migration below readable and consistent.
 */
function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (columns.some(c => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Fills a column that was added after rows already existed. */
function backfillColumn(table: string, column: string, value: () => string) {
  const rows = db
    .prepare(`SELECT id FROM ${table} WHERE ${column} IS NULL OR ${column} = ''`)
    .all() as { id: string }[]
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`)
  for (const row of rows) update.run(value(), row.id)
}

db.exec(`
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  server_url TEXT NOT NULL,
  server_id TEXT NOT NULL,
  server_name TEXT NOT NULL DEFAULT '',
  jellyfin_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_server_user ON connections(server_id, jellyfin_user_id);
`)

// Additive migration: two optional Jellyfin URLs used only to build browser-facing
// "Open in Jellyfin" links from a non-local network (public domain / Tailscale).
// server_url is untouched and remains the only URL ever used for outbound
// Jellyfin API calls (auth, session polling, artwork, search).
addColumnIfMissing('connections', 'public_url', 'TEXT')
addColumnIfMissing('connections', 'tailscale_url', 'TEXT')
addColumnIfMissing('connections', 'device_id', 'TEXT')
// Every Soundcheck login used to identify itself to Jellyfin with the exact same
// hardcoded DeviceId, so a second login (another browser, or the same account from a
// different network) looked like the same device re-authenticating and could
// invalidate a token an already-open tab was still using. The admin/tracker
// connection needs its own stable identity distinct from any browser session's
// (see web_sessions.device_id) — backfill it once for any row that predates this.
backfillColumn('connections', 'device_id', () => newDeviceId(ADMIN_DEVICE_ID_PREFIX))

db.exec(`
CREATE TABLE IF NOT EXISTS play_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  item_id TEXT NOT NULL,
  track_title TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  album_name TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  listened_ms INTEGER NOT NULL DEFAULT 0,
  track_duration_ms INTEGER NOT NULL DEFAULT 0,
  is_skip INTEGER NOT NULL DEFAULT 0,
  completion_ratio REAL NOT NULL DEFAULT 0,
  session_key TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  play_instance_id TEXT NOT NULL DEFAULT '',
  jellyfin_play_session_id TEXT NOT NULL DEFAULT '',
  end_reason TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_play_events_user_started ON play_events(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_play_events_item ON play_events(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_play_events_artist ON play_events(user_id, artist_name);

CREATE TABLE IF NOT EXISTS open_sessions (
  session_key TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  item_id TEXT NOT NULL,
  track_title TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  album_name TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '',
  track_duration_ms INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_position_ms INTEGER NOT NULL DEFAULT 0,
  accumulated_ms INTEGER NOT NULL DEFAULT 0,
  playback_state TEXT NOT NULL DEFAULT 'playing',
  device_name TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  play_instance_id TEXT NOT NULL DEFAULT '',
  jellyfin_play_session_id TEXT NOT NULL DEFAULT '',
  playback_start_time_ms INTEGER NOT NULL DEFAULT 0,
  playlist_item_id TEXT NOT NULL DEFAULT '',
  repeat_mode TEXT NOT NULL DEFAULT 'RepeatNone'
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_meta (
  user_id TEXT PRIMARY KEY,
  tracking_started_at INTEGER NOT NULL,
  first_listening_at INTEGER
);

CREATE TABLE IF NOT EXISTS web_sessions (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  jellyfin_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  is_administrator INTEGER NOT NULL DEFAULT 0,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);

`)

// Additive: each login gets its own Jellyfin DeviceId (see connections.device_id
// above for why) instead of sharing one across every browser/session.
addColumnIfMissing('web_sessions', 'device_id', 'TEXT')
// Backfill a unique id for any session created before this fix existed, so an
// already-open browser tab stops sending the old shared identity immediately
// rather than waiting for its next login.
backfillColumn('web_sessions', 'device_id', () => newDeviceId(DEVICE_ID_PREFIX))

// 0.6.4: preserve existing data while adding playback-instance identity
// and the Jellyfin playback-state fields used to make repeat/resume detection robust.
addColumnIfMissing('open_sessions', 'play_instance_id', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('open_sessions', 'jellyfin_play_session_id', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('open_sessions', 'playback_start_time_ms', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('open_sessions', 'playlist_item_id', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('open_sessions', 'repeat_mode', "TEXT NOT NULL DEFAULT 'RepeatNone'")
addColumnIfMissing('play_events', 'play_instance_id', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('play_events', 'jellyfin_play_session_id', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('play_events', 'end_reason', "TEXT NOT NULL DEFAULT ''")
addColumnIfMissing('play_events', 'completed', 'INTEGER NOT NULL DEFAULT 0')
// One row per playback instance — the tracker relies on INSERT OR IGNORE against
// this index to stay idempotent if the same play is finalized twice.
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_play_events_instance ON play_events(play_instance_id) WHERE play_instance_id != ''",
)
// Admin-only per-account escape hatch: unlock every gradual-unlock module
// early, without waiting for the real day thresholds. Settings hides the
// toggle once the account would be fully unlocked anyway.
addColumnIfMissing('user_meta', 'unlock_override', 'INTEGER NOT NULL DEFAULT 0')

export function saveConnection(c: {
  id: string
  serverUrl: string
  serverId: string
  serverName: string
  userId: string
  username: string
  ciphertext: string
  iv: string
  tag: string
}) {
  const now = Date.now()
  const save = db.transaction(() => {
    // A server has one tracker connection. Remove a stale row for the same
    // server/user first so older per-user connection IDs cannot collide with
    // the new server-wide connection. Playback events are intentionally kept.
    const duplicate = db
      .prepare(
        'SELECT id FROM connections WHERE server_id = ? AND jellyfin_user_id = ? AND id != ?',
      )
      .get(c.serverId, c.userId, c.id) as { id: string } | undefined
    if (duplicate) {
      db.prepare('DELETE FROM open_sessions WHERE connection_id = ?').run(duplicate.id)
      db.prepare('DELETE FROM connections WHERE id = ?').run(duplicate.id)
    }

    const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(c.id) as
      { id: string } | undefined
    if (existing) {
      db.prepare(
        `UPDATE connections SET
        server_url=@serverUrl, server_id=@serverId, server_name=@serverName, jellyfin_user_id=@userId,
        username=@username, token_ciphertext=@ciphertext, token_iv=@iv, token_tag=@tag, updated_at=@now
        WHERE id=@id`,
      ).run({ ...c, now })
      return
    }
    // Seed the optional browser-facing URLs from env vars, and a fresh Jellyfin
    // DeviceId, only when the connection is first created; an existing connection's
    // saved values (possibly edited later in Admin Settings) are never touched here.
    db.prepare(
      `INSERT INTO connections
      (id,server_url,server_id,server_name,jellyfin_user_id,username,token_ciphertext,token_iv,token_tag,public_url,tailscale_url,device_id,created_at,updated_at)
      VALUES (@id,@serverUrl,@serverId,@serverName,@userId,@username,@ciphertext,@iv,@tag,@publicUrl,@tailscaleUrl,@deviceId,@now,@now)`,
    ).run({
      ...c,
      now,
      publicUrl: process.env.JELLYFIN_PUBLIC_URL || null,
      tailscaleUrl: process.env.JELLYFIN_TAILSCALE_URL || null,
      deviceId: newDeviceId(ADMIN_DEVICE_ID_PREFIX),
    })
  })
  save()
}

// Lets an admin set/change the two browser-facing URLs after setup (e.g. from
// Admin Settings) without touching server_url or re-authenticating. Passing
// null clears a URL back to "unset" (falls through to the next bucket).
export function updateConnectionUrls(
  id: string,
  urls: { publicUrl?: string | null; tailscaleUrl?: string | null },
) {
  if (urls.publicUrl !== undefined)
    db.prepare('UPDATE connections SET public_url = ?, updated_at = ? WHERE id = ?').run(
      urls.publicUrl || null,
      Date.now(),
      id,
    )
  if (urls.tailscaleUrl !== undefined)
    db.prepare('UPDATE connections SET tailscale_url = ?, updated_at = ? WHERE id = ?').run(
      urls.tailscaleUrl || null,
      Date.now(),
      id,
    )
}

export function listConnections() {
  return db.prepare('SELECT * FROM connections ORDER BY username COLLATE NOCASE').all() as any[]
}

export function getConnection(id: string) {
  return (db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as any) || null
}

// Soundcheck is single-server by design (see removeOtherServerConnections), so
// there is at most one row here — this powers the login screen's "we already
// know your server" shortcut without the caller needing a server ID upfront.
export function getFirstConnection() {
  return (
    (db.prepare('SELECT * FROM connections ORDER BY updated_at DESC LIMIT 1').get() as any) || null
  )
}

// Web sessions are persisted so a logged-in browser stays logged in across
// container restarts/rebuilds — they only end when the session expires or the
// user explicitly logs out, never as a side effect of redeploying.
export function saveWebSession(s: {
  id: string
  connectionId: string
  jellyfinUserId: string
  username: string
  isAdministrator: boolean
  tokenCiphertext: string
  tokenIv: string
  tokenTag: string
  expiresAt: number
  deviceId: string
}) {
  const now = Date.now()
  db.prepare(
    `INSERT INTO web_sessions
    (id,connection_id,jellyfin_user_id,username,is_administrator,token_ciphertext,token_iv,token_tag,expires_at,device_id,created_at)
    VALUES (@id,@connectionId,@jellyfinUserId,@username,@isAdministrator,@tokenCiphertext,@tokenIv,@tokenTag,@expiresAt,@deviceId,@now)`,
  ).run({ ...s, isAdministrator: s.isAdministrator ? 1 : 0, now })
}

export function deleteWebSession(id: string) {
  db.prepare('DELETE FROM web_sessions WHERE id = ?').run(id)
}

// Called once at startup to repopulate the in-memory session map; also sweeps
// out anything already expired so the table doesn't grow unbounded.
export function loadActiveWebSessions() {
  db.prepare('DELETE FROM web_sessions WHERE expires_at < ?').run(Date.now())
  return db.prepare('SELECT * FROM web_sessions').all() as any[]
}

export function getConnectionByServerId(serverId: string) {
  return (
    (db
      .prepare('SELECT * FROM connections WHERE server_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(serverId) as any) || null
  )
}

export function removeOtherServerConnections(serverId: string, keepId: string) {
  const oldIds = db
    .prepare('SELECT id FROM connections WHERE server_id = ? AND id != ?')
    .all(serverId, keepId) as { id: string }[]
  const remove = db.transaction((ids: string[]) => {
    for (const id of ids) {
      db.prepare('DELETE FROM open_sessions WHERE connection_id = ?').run(id)
      db.prepare('DELETE FROM connections WHERE id = ?').run(id)
    }
  })
  remove(oldIds.map(x => x.id))
}

export function upsertOpenSession(s: OpenSession & { device_name?: string; client_name?: string }) {
  db.prepare(
    `INSERT INTO open_sessions
    (session_key,connection_id,user_id,username,item_id,track_title,artist_name,album_name,genres,track_duration_ms,started_at,last_seen_at,last_position_ms,accumulated_ms,playback_state,device_name,client_name,play_instance_id,jellyfin_play_session_id,playback_start_time_ms,playlist_item_id,repeat_mode)
    VALUES (@session_key,@connection_id,@user_id,@username,@item_id,@track_title,@artist_name,@album_name,@genres,@track_duration_ms,@started_at,@last_seen_at,@last_position_ms,@accumulated_ms,@playback_state,@device_name,@client_name,@play_instance_id,@jellyfin_play_session_id,@playback_start_time_ms,@playlist_item_id,@repeat_mode)
    ON CONFLICT(session_key) DO UPDATE SET
      track_title=excluded.track_title,artist_name=excluded.artist_name,album_name=excluded.album_name,genres=excluded.genres,
      track_duration_ms=excluded.track_duration_ms,last_seen_at=excluded.last_seen_at,last_position_ms=excluded.last_position_ms,
      accumulated_ms=excluded.accumulated_ms,playback_state=excluded.playback_state,device_name=excluded.device_name,client_name=excluded.client_name,play_instance_id=excluded.play_instance_id,jellyfin_play_session_id=excluded.jellyfin_play_session_id,playback_start_time_ms=excluded.playback_start_time_ms,playlist_item_id=excluded.playlist_item_id,repeat_mode=excluded.repeat_mode`,
  ).run(s)
}

export function getOpenSession(key: string) {
  return db.prepare('SELECT * FROM open_sessions WHERE session_key=?').get(key) as
    OpenSession | undefined
}
export function deleteOpenSession(key: string) {
  db.prepare('DELETE FROM open_sessions WHERE session_key=?').run(key)
}

export function recordPlayEvent(e: {
  connectionId: string
  userId: AuthedUserId
  username: string
  itemId: string
  trackTitle: string
  artistName: string
  albumName: string
  genres: string
  startedAt: number
  endedAt: number
  listenedMs: number
  trackDurationMs: number
  isSkip: boolean
  completed: boolean
  endReason: string
  deviceName: string
  clientName: string
  sessionKey: string
  playInstanceId: string
  jellyfinPlaySessionId: string
}) {
  const ratio =
    e.trackDurationMs > 0 ? Math.min(1, Math.max(0, e.listenedMs / e.trackDurationMs)) : 0
  return db
    .prepare(
      `INSERT OR IGNORE INTO play_events
    (connection_id,user_id,username,item_id,track_title,artist_name,album_name,genres,started_at,ended_at,listened_ms,track_duration_ms,is_skip,completion_ratio,session_key,device_name,client_name,play_instance_id,jellyfin_play_session_id,end_reason,completed,created_at)
    VALUES (@connectionId,@userId,@username,@itemId,@trackTitle,@artistName,@albumName,@genres,@startedAt,@endedAt,@listenedMs,@trackDurationMs,@isSkip,@ratio,@sessionKey,@deviceName,@clientName,@playInstanceId,@jellyfinPlaySessionId,@endReason,@completed,@createdAt)`,
    )
    .run({
      ...e,
      isSkip: e.isSkip ? 1 : 0,
      completed: e.completed ? 1 : 0,
      ratio,
      createdAt: Date.now(),
    })
}

export function ensureTrackingStart(userId: AuthedUserId) {
  const existing = db
    .prepare(
      'SELECT tracking_started_at, first_listening_at, unlock_override FROM user_meta WHERE user_id = ?',
    )
    .get(userId) as any
  if (existing) return existing
  const firstListening = db
    .prepare('SELECT MIN(started_at) AS first_listening_at FROM play_events WHERE user_id = ?')
    .get(userId) as any
  const firstListeningAt = firstListening?.first_listening_at
    ? Number(firstListening.first_listening_at)
    : null
  const trackingStartedAt = firstListeningAt || Date.now()
  db.prepare(
    'INSERT INTO user_meta (user_id, tracking_started_at, first_listening_at) VALUES (?, ?, ?)',
  ).run(userId, trackingStartedAt, firstListeningAt)
  return {
    tracking_started_at: trackingStartedAt,
    first_listening_at: firstListeningAt,
    unlock_override: 0,
  }
}

export function trackingMeta(userId: AuthedUserId) {
  const meta = ensureTrackingStart(userId)
  const years = (
    db
      .prepare(
        `SELECT DISTINCT CAST(strftime('%Y', started_at/1000, 'unixepoch', 'localtime') AS INTEGER) year
    FROM play_events WHERE user_id=? ORDER BY year DESC`,
      )
      .all(userId) as any[]
  )
    .map(row => Number(row.year))
    .filter(year => year >= MIN_YEAR)
  return {
    years,
    trackingStartedAt: Number(meta.tracking_started_at),
    firstListeningAt: meta.first_listening_at ? Number(meta.first_listening_at) : null,
    unlockOverride: Boolean(meta.unlock_override),
  }
}

// Admin-only escape hatch (see the migration above) — forces every gradual-unlock
// module open early for just this one account, regardless of trackingStartedAt.
export function setUnlockOverride(userId: AuthedUserId, value: boolean) {
  ensureTrackingStart(userId)
  db.prepare('UPDATE user_meta SET unlock_override = ? WHERE user_id = ?').run(
    value ? 1 : 0,
    userId,
  )
}

const MS_PER_DAY = 86_400_000

/**
 * How many rows each section of the dashboard payload carries. These bound the
 * single /api/dashboard response, so a listener with years of history returns
 * the same size payload as a new one.
 */
const LIMITS = {
  topSongs: 50,
  topArtists: 20,
  topAlbums: 20,
  topGenres: 10,
  /** "Never skipped" / "Almost always skipped" / repeat-streak columns. */
  songBehavior: 4,
  trending: 5,
  recentSongs: 10,
  devices: 10,
  genreTopTracks: 15,
} as const

/** The rolling window behind the "trending this week" list. */
const TRENDING_WINDOW_DAYS = 7
/** How far back the per-genre daily sparkline reaches. */
const GENRE_DAILY_WINDOW_DAYS = 90

export function stats(userId: AuthedUserId, year: number) {
  // All calendar-based reporting is evaluated in the container's configured
  // timezone (TZ). This keeps Soundcheck correct for installations outside UTC.
  const base = { userId, year: String(year) }
  const yearWhere = `strftime('%Y',started_at/1000,'unixepoch','localtime')=@year`

  const totals = db
    .prepare(
      `SELECT
    COALESCE(SUM(listened_ms),0) listened_ms,
    COUNT(*) plays,
    COUNT(DISTINCT item_id) unique_tracks,
    COUNT(DISTINCT NULLIF(artist_name,'')) unique_artists,
    COUNT(DISTINCT CASE WHEN album_name != '' THEN artist_name || '::' || album_name END) unique_albums,
    COALESCE(AVG(completion_ratio),0) avg_completion,
    COALESCE(SUM(is_skip),0) skips
    FROM play_events WHERE user_id=@userId AND ${yearWhere}`,
    )
    .get(base) as any

  // Ranked without a LIMIT so a song far outside the Top 50 (e.g. something the
  // Activity page's Recently Played list surfaces) can still report its real
  // overall standing instead of only "is it in the top 50 or not".
  const allSongsRanked = db
    .prepare(
      `SELECT item_id,track_title,artist_name,album_name,COUNT(*) plays,SUM(listened_ms) listened_ms,MAX(track_duration_ms) track_duration_ms
    FROM play_events WHERE user_id=@userId AND ${yearWhere}
    GROUP BY item_id,track_title,artist_name,album_name ORDER BY plays DESC,listened_ms DESC`,
    )
    .all(base) as any[]
  const fullRankByItem = new Map<string, number>()
  allSongsRanked.forEach((s: any, i: number) => {
    if (!fullRankByItem.has(String(s.item_id))) fullRankByItem.set(String(s.item_id), i + 1)
  })
  const completionByItem = new Map<string, number>(
    (
      db
        .prepare(
          `SELECT item_id,AVG(completion_ratio) c FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!='' GROUP BY item_id`,
        )
        .all(base) as any[]
    ).map(r => [String(r.item_id), Number(r.c || 0)]),
  )
  const lastPlayedByItem = new Map<string, number>(
    (
      db
        .prepare(
          `SELECT item_id,MAX(started_at) last_played FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!='' GROUP BY item_id`,
        )
        .all(base) as any[]
    ).map(r => [String(r.item_id), Number(r.last_played || 0)]),
  )
  // The Top Tracks "Songs 11-50" table needs the same per-song context as the
  // Activity page's Recently Played list, so it gets it from the same source
  // maps rather than a second query.
  const topSongs = allSongsRanked.slice(0, LIMITS.topSongs).map((s: any) => ({
    ...s,
    completion: completionByItem.get(String(s.item_id)) || 0,
    last_played: lastPlayedByItem.get(String(s.item_id)) || 0,
    overallRank: fullRankByItem.get(String(s.item_id)) || null,
  }))
  const monthlyTopRows = db
    .prepare(
      `SELECT month,item_id,track_title,artist_name,album_name,plays,listened_ms FROM (
      SELECT
        CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month,
        item_id,track_title,artist_name,album_name,
        COUNT(*) plays, SUM(listened_ms) listened_ms,
        ROW_NUMBER() OVER (PARTITION BY CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) ORDER BY COUNT(*) DESC,SUM(listened_ms) DESC) rn
      FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!=''
      GROUP BY month,item_id,track_title,artist_name,album_name
    ) WHERE rn=1`,
    )
    .all(base) as any[]
  const monthlyTopSongs = Array.from({ length: 12 }, (_, i) => {
    const row = monthlyTopRows.find(r => Number(r.month) === i + 1)
    return row
      ? {
          item_id: String(row.item_id),
          track_title: String(row.track_title || 'Untitled track'),
          artist_name: String(row.artist_name || ''),
          album_name: String(row.album_name || ''),
          plays: Number(row.plays || 0),
          listened_ms: Math.round(Number(row.listened_ms || 0)),
        }
      : null
  })
  // Only tracks played at least twice qualify — a single play tells you nothing
  // about whether a song is one you always finish or one you keep abandoning.
  const songBehaviorRows = db
    .prepare(
      `SELECT item_id,track_title,artist_name,album_name,COUNT(*) plays,AVG(completion_ratio) avg_completion,SUM(is_skip) skips
    FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!=''
    GROUP BY item_id,track_title,artist_name,album_name
    HAVING COUNT(*)>=2`,
    )
    .all(base) as any[]
  const toBehaviorEntry = (row: any) => ({
    item_id: String(row.item_id),
    track_title: String(row.track_title || 'Untitled track'),
    artist_name: String(row.artist_name || ''),
    album_name: String(row.album_name || ''),
    plays: Number(row.plays || 0),
    completion: Number(row.avg_completion || 0),
    skipRate: Number(row.plays) > 0 ? Number(row.skips || 0) / Number(row.plays) : 0,
  })
  const neverSkippedSongs = songBehaviorRows
    .filter(r => Number(r.skips) === 0)
    .sort(
      (a, b) =>
        Number(b.avg_completion) - Number(a.avg_completion) || Number(b.plays) - Number(a.plays),
    )
    .slice(0, 4)
    .map(toBehaviorEntry)
  const mostSkippedSongs = songBehaviorRows
    .filter(r => Number(r.skips) > 0)
    .sort(
      (a, b) =>
        Number(b.skips) / Number(b.plays) - Number(a.skips) / Number(a.plays) ||
        Number(b.plays) - Number(a.plays),
    )
    .slice(0, 4)
    .map(toBehaviorEntry)
  // A "streak" is the most times a single song was replayed on one calendar day.
  // Only days with 2+ plays of the same song count as a streak at all.
  const dailyRepeatRows = db
    .prepare(
      `SELECT item_id,track_title,artist_name,album_name,
      strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime') day,
      COUNT(*) day_plays, AVG(completion_ratio) day_completion
    FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!=''
    GROUP BY item_id,track_title,artist_name,album_name,day
    HAVING COUNT(*)>=2`,
    )
    .all(base) as any[]
  const bestStreakByItem = new Map<string, any>()
  for (const row of dailyRepeatRows) {
    const key = String(row.item_id)
    const existing = bestStreakByItem.get(key)
    if (
      !existing ||
      Number(row.day_plays) > Number(existing.day_plays) ||
      (Number(row.day_plays) === Number(existing.day_plays) &&
        String(row.day) > String(existing.day))
    ) {
      bestStreakByItem.set(key, row)
    }
  }
  // Rank by raw replay count first, but when two songs tie on plays-in-a-day,
  // prefer the one you actually listened through — a 5x streak of full listens
  // says more about obsession than 5x of restarting and bailing.
  const repeatStreaks = [...bestStreakByItem.values()]
    .sort(
      (a, b) =>
        Number(b.day_plays) - Number(a.day_plays) ||
        Number(b.day_completion || 0) - Number(a.day_completion || 0) ||
        String(b.day).localeCompare(String(a.day)),
    )
    .slice(0, 4)
    .map(row => ({
      item_id: String(row.item_id),
      track_title: String(row.track_title || 'Untitled track'),
      artist_name: String(row.artist_name || ''),
      album_name: String(row.album_name || ''),
      day: String(row.day),
      dayPlays: Number(row.day_plays),
      avgCompletion: Number(row.day_completion || 0),
    }))
  // "This week" is a rolling 7-day window from right now — independent of the
  // year filter above, since trending only makes sense for whichever year is
  // actually current. Ranked against the year's overall top list so a song can
  // be flagged "NEW" (never charted this year) or moving up/down against its
  // usual standing.
  const trendingSince = Date.now() - TRENDING_WINDOW_DAYS * MS_PER_DAY
  const trendingRows = db
    .prepare(
      `SELECT item_id,track_title,artist_name,album_name,COUNT(*) plays
    FROM play_events WHERE user_id=@userId AND started_at>=@since AND item_id!=''
    GROUP BY item_id,track_title,artist_name,album_name
    ORDER BY plays DESC,MAX(started_at) DESC LIMIT ${LIMITS.trending}`,
    )
    .all({ userId, since: trendingSince }) as any[]
  const overallRankByItem = new Map<string, number>()
  topSongs.forEach((s: any, i: number) => overallRankByItem.set(String(s.item_id), i + 1))
  const trendingSongs = trendingRows.map((row, i) => ({
    item_id: String(row.item_id),
    track_title: String(row.track_title || 'Untitled track'),
    artist_name: String(row.artist_name || ''),
    album_name: String(row.album_name || ''),
    plays: Number(row.plays || 0),
    weekRank: i + 1,
    overallRank: overallRankByItem.get(String(row.item_id)) ?? null,
  }))
  // Per-artist completion/unique-song-count and each artist's own most-played
  // song — powers the Dashboard's Top Artist card (avg completion chip,
  // unique-song count, and the "favourite track" spotlight).
  const artistBehaviorByName = new Map<
    string,
    { completion: number; uniqueSongs: number; firstPlayed: number; lastPlayed: number }
  >(
    (
      db
        .prepare(
          `SELECT artist_name,AVG(completion_ratio) c,COUNT(DISTINCT item_id) songs,MIN(started_at) first,MAX(started_at) last FROM play_events
      WHERE user_id=@userId AND ${yearWhere} AND artist_name!='' GROUP BY artist_name`,
        )
        .all(base) as any[]
    ).map(r => [
      String(r.artist_name),
      {
        completion: Number(r.c || 0),
        uniqueSongs: Number(r.songs || 0),
        firstPlayed: Number(r.first || 0),
        lastPlayed: Number(r.last || 0),
      },
    ]),
  )
  const favoriteTrackByArtist = new Map<
    string,
    { item_id: string; title: string; plays: number; listened_ms: number }
  >()
  for (const row of db
    .prepare(
      `SELECT artist_name,item_id,track_title,COUNT(*) plays,SUM(listened_ms) ms FROM play_events
    WHERE user_id=@userId AND ${yearWhere} AND artist_name!='' AND item_id!='' GROUP BY artist_name,item_id,track_title`,
    )
    .all(base) as any[]) {
    const key = String(row.artist_name)
    const existing = favoriteTrackByArtist.get(key)
    const plays = Number(row.plays || 0)
    const listened_ms = Number(row.ms || 0)
    // Tie-break equal play counts by total time listened — two songs played
    // 7 times each aren't equally "favourite" if one is a 4-minute track and
    // the other a 30-second clip.
    if (
      !existing ||
      plays > existing.plays ||
      (plays === existing.plays && listened_ms > existing.listened_ms)
    ) {
      favoriteTrackByArtist.set(key, {
        item_id: String(row.item_id),
        title: String(row.track_title || 'Untitled track'),
        plays,
        listened_ms,
      })
    }
  }
  const topArtists = (
    db
      .prepare(
        `SELECT artist_name,COUNT(*) plays,SUM(listened_ms) listened_ms FROM play_events
    WHERE user_id=@userId AND ${yearWhere} AND artist_name!=''
    GROUP BY artist_name ORDER BY plays DESC,listened_ms DESC LIMIT ${LIMITS.topArtists}`,
      )
      .all(base) as any[]
  ).map(row => {
    const name = String(row.artist_name)
    const behavior = artistBehaviorByName.get(name)
    return {
      artist_name: name,
      plays: Number(row.plays || 0),
      listened_ms: Number(row.listened_ms || 0),
      avgCompletion: behavior?.completion || 0,
      uniqueSongs: behavior?.uniqueSongs || 0,
      firstPlayed: behavior?.firstPlayed || 0,
      lastPlayed: behavior?.lastPlayed || 0,
      favoriteTrack: favoriteTrackByArtist.get(name) || null,
    }
  })
  const topAlbums = db
    .prepare(
      `SELECT album_name,artist_name,COUNT(*) plays,SUM(listened_ms) listened_ms,COUNT(DISTINCT item_id) unique_songs FROM play_events
    WHERE user_id=@userId AND ${yearWhere} AND album_name!=''
    GROUP BY album_name,artist_name ORDER BY plays DESC,listened_ms DESC LIMIT ${LIMITS.topAlbums}`,
    )
    .all(base) as any[]
  const genreRows = db
    .prepare(
      `SELECT genres,item_id,track_title,artist_name,album_name,listened_ms,started_at,
      CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month,
      CAST(strftime('%H',started_at/1000,'unixepoch','localtime') AS INTEGER) hour,
      strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime') day
    FROM play_events WHERE user_id=@userId AND ${yearWhere}`,
    )
    .all(base) as any[]
  const monthly = db
    .prepare(
      `SELECT CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month, SUM(listened_ms) listened_ms, COUNT(*) plays
    FROM play_events WHERE user_id=@userId AND ${yearWhere} GROUP BY month ORDER BY month`,
    )
    .all(base) as any[]
  const hourly = db
    .prepare(
      `SELECT CAST(strftime('%H',started_at/1000,'unixepoch','localtime') AS INTEGER) hour, SUM(listened_ms) listened_ms, COUNT(*) plays
    FROM play_events WHERE user_id=@userId AND ${yearWhere} GROUP BY hour ORDER BY hour`,
    )
    .all(base) as any[]
  // Same shape as `hourly`, but scoped to just today (not the selected year) so
  // the Listening Clock can offer a "today" view alongside its yearly one.
  const todayHourly = db
    .prepare(
      `SELECT CAST(strftime('%H',started_at/1000,'unixepoch','localtime') AS INTEGER) hour, SUM(listened_ms) listened_ms, COUNT(*) plays
    FROM play_events WHERE user_id=@userId
      AND strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime')=strftime('%Y-%m-%d','now','localtime')
    GROUP BY hour ORDER BY hour`,
    )
    .all({ userId }) as any[]
  // Per-song breakdown backing the "what did I listen to" popup on the Today view of
  // the Listening Clock. Flat rows (not pre-bucketed by hour) since the frontend already
  // has `todayHourly` to know which hours have anything to show.
  const todayHourlySongs = db
    .prepare(
      `SELECT CAST(strftime('%H',started_at/1000,'unixepoch','localtime') AS INTEGER) hour,
      item_id, track_title, album_name, artist_name, COUNT(*) plays, SUM(listened_ms) listened_ms
    FROM play_events WHERE user_id=@userId
      AND strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime')=strftime('%Y-%m-%d','now','localtime')
    GROUP BY hour,item_id ORDER BY hour,plays DESC,listened_ms DESC`,
    )
    .all({ userId }) as any[]
  // SQLite's %w gives 0=Sunday..6=Saturday; shift so the array is Monday-first (index 0=Mon..6=Sun)
  // to match how the rest of the app (and most listening-activity charts) present a week.
  const weekdayRows = db
    .prepare(
      `SELECT CAST(strftime('%w',started_at/1000,'unixepoch','localtime') AS INTEGER) dow, SUM(listened_ms) listened_ms, COUNT(*) plays
    FROM play_events WHERE user_id=@userId AND ${yearWhere} GROUP BY dow`,
    )
    .all(base) as any[]
  const weekday = Array.from({ length: 7 }, (_, mondayFirst) => {
    const sqliteDow = (mondayFirst + 1) % 7
    const row = weekdayRows.find(r => Number(r.dow) === sqliteDow)
    return {
      dow: mondayFirst,
      plays: Number(row?.plays || 0),
      listened_ms: Math.round(Number(row?.listened_ms || 0)),
    }
  })
  const dailyCalendar = (
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime') day, SUM(listened_ms) listened_ms
    FROM play_events WHERE user_id=@userId AND ${yearWhere} GROUP BY day ORDER BY day`,
      )
      .all(base) as any[]
  ).map(row => ({ date: String(row.day), listened_ms: Math.round(Number(row.listened_ms || 0)) }))
  const recentSongs = (
    db
      .prepare(
        `SELECT item_id,track_title,album_name,artist_name,COUNT(*) plays,
      COALESCE(SUM(listened_ms),0) listened_ms,MAX(started_at) last_played
    FROM play_events WHERE user_id=@userId AND ${yearWhere} AND item_id!=''
    GROUP BY item_id,track_title,album_name,artist_name ORDER BY last_played DESC LIMIT ${LIMITS.recentSongs}`,
      )
      .all(base) as any[]
  ).map(row => ({
    item_id: String(row.item_id),
    track_title: String(row.track_title || 'Untitled track'),
    album_name: String(row.album_name || ''),
    artist_name: String(row.artist_name || ''),
    plays: Number(row.plays || 0),
    listened_ms: Math.round(Number(row.listened_ms || 0)),
    last_played: Number(row.last_played || 0),
    completion: completionByItem.get(String(row.item_id)) || 0,
    overallRank: fullRankByItem.get(String(row.item_id)) || null,
  }))
  const devices = db
    .prepare(
      `SELECT device_name,client_name,SUM(listened_ms) listened_ms,COUNT(*) plays FROM play_events
    WHERE user_id=@userId AND ${yearWhere} GROUP BY device_name,client_name ORDER BY listened_ms DESC LIMIT ${LIMITS.devices}`,
    )
    .all(base) as any[]

  const genresTotals = new Map<string, number>()
  for (const row of genreRows)
    for (const raw of String(row.genres || '')
      .split('|')
      .map(x => x.trim())
      .filter(Boolean))
      genresTotals.set(raw, (genresTotals.get(raw) || 0) + 1)
  const topGenres = [...genresTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }))

  // Genre-level rollups drive the dedicated Genres view. Each play
  // contributes an equal share to every tagged genre so genre percentages
  // remain meaningful when a track has multiple genre labels.
  const genreMap = new Map<
    string,
    {
      genre: string
      plays: number
      listened_ms: number
      tracks: Set<string>
      artists: Set<string>
      monthly: number[]
      hourly: number[]
      daily: Map<string, number>
      topTracks: Map<
        string,
        {
          item_id: string
          track_title: string
          artist_name: string
          plays: number
          listened_ms: number
        }
      >
      topArtists: Map<string, { artist_name: string; plays: number; listened_ms: number }>
    }
  >()
  for (const row of genreRows) {
    const names = [
      ...new Set(
        String(row.genres || '')
          .split('|')
          .map((x: string) => x.trim())
          .filter(Boolean),
      ),
    ]
    if (!names.length) continue
    const weight = 1 / names.length
    const listened = Math.max(0, Number(row.listened_ms || 0)) * weight
    const month = Math.max(1, Math.min(12, Number(row.month || 0)))
    const hour = Math.max(0, Math.min(23, Number(row.hour || 0)))
    const day = String(row.day || '')
    for (const genre of names) {
      let g = genreMap.get(genre)
      if (!g) {
        g = {
          genre,
          plays: 0,
          listened_ms: 0,
          tracks: new Set(),
          artists: new Set(),
          monthly: Array(12).fill(0),
          hourly: Array(24).fill(0),
          daily: new Map(),
          topTracks: new Map(),
          topArtists: new Map(),
        }
        genreMap.set(genre, g)
      }
      g.plays += weight
      g.listened_ms += listened
      g.monthly[month - 1] += listened
      g.hourly[hour] += listened
      if (day) g.daily.set(day, (g.daily.get(day) || 0) + listened)
      if (row.item_id) g.tracks.add(String(row.item_id))
      if (String(row.artist_name || '')) g.artists.add(String(row.artist_name))
      const trackKey = String(row.item_id || `${row.artist_name || ''}::${row.track_title || ''}`)
      const tt = g.topTracks.get(trackKey) || {
        item_id: String(row.item_id || ''),
        track_title: String(row.track_title || 'Untitled track'),
        artist_name: String(row.artist_name || ''),
        plays: 0,
        listened_ms: 0,
      }
      tt.plays += weight
      tt.listened_ms += listened
      g.topTracks.set(trackKey, tt)
      const artistName = String(row.artist_name || '').trim()
      if (artistName) {
        const ta = g.topArtists.get(artistName) || {
          artist_name: artistName,
          plays: 0,
          listened_ms: 0,
        }
        ta.plays += weight
        ta.listened_ms += listened
        g.topArtists.set(artistName, ta)
      }
    }
  }
  // Bounded to the last 90 days so the payload stays small regardless of
  // account age — only needed by the Genres page's early-account weekly view.
  const dailyCutoff = new Date(Date.now() - GENRE_DAILY_WINDOW_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
  const genreStats = [...genreMap.values()]
    .sort((a, b) => b.plays - a.plays || b.listened_ms - a.listened_ms)
    .map(g => ({
      genre: g.genre,
      plays: Number(g.plays.toFixed(3)),
      listened_ms: Math.round(g.listened_ms),
      unique_tracks: g.tracks.size,
      unique_artists: g.artists.size,
      monthly: g.monthly.map(x => Math.round(x)),
      hourly: g.hourly.map(x => Math.round(x)),
      daily: [...g.daily.entries()]
        .filter(([d]) => d >= dailyCutoff)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, ms]) => ({ date, listened_ms: Math.round(ms) })),
      topTrack:
        [...g.topTracks.values()].sort(
          (a, b) => b.plays - a.plays || b.listened_ms - a.listened_ms,
        )[0] || null,
      topArtist:
        [...g.topArtists.values()].sort(
          (a, b) => b.plays - a.plays || b.listened_ms - a.listened_ms,
        )[0] || null,
    }))
    .slice(0, 15)

  const discovery = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (
    SELECT artist_name,MIN(started_at) first_played FROM play_events
    WHERE user_id=@userId AND artist_name!=''
    GROUP BY artist_name
  ) WHERE strftime('%Y',first_played/1000,'unixepoch','localtime')=@year`,
    )
    .get(base) as any

  // Derived metrics use only finalized play_events, so they remain
  // valid while the current year is still being collected.
  const repeatPlays = Math.max(0, Number(totals?.plays || 0) - Number(totals?.unique_tracks || 0))
  const repeatRate = Number(totals?.plays || 0) > 0 ? repeatPlays / Number(totals.plays) : 0

  const listeningDaysRows = db
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m-%d',started_at/1000,'unixepoch','localtime') day
    FROM play_events WHERE user_id=@userId AND ${yearWhere} ORDER BY day`,
    )
    .all(base) as any[]
  const listeningDays = listeningDaysRows.map(row => String(row.day)).filter(Boolean)
  let longestStreak = listeningDays.length ? 1 : 0
  let currentStreak = listeningDays.length ? 1 : 0
  for (let i = 1; i < listeningDays.length; i++) {
    const prev = Date.parse(`${listeningDays[i - 1]}T00:00:00Z`)
    const cur = Date.parse(`${listeningDays[i]}T00:00:00Z`)
    if (cur - prev === 86400000) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else currentStreak = 1
  }
  // The trailing run above only counts as an active "current streak" if it
  // reaches today or yesterday — otherwise it's a past streak that already ended.
  if (listeningDays.length) {
    const lastDay = Date.parse(`${listeningDays[listeningDays.length - 1]}T00:00:00Z`)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ || 'UTC' })
    const today = Date.parse(`${todayStr}T00:00:00Z`)
    if (today - lastDay > 86400000) currentStreak = 0
  }

  const sessionEvents = db
    .prepare(
      `SELECT started_at,ended_at,listened_ms FROM play_events
    WHERE user_id=@userId AND ${yearWhere} ORDER BY started_at ASC`,
    )
    .all(base) as any[]
  const sessionDurations: number[] = []
  let sessionListened = 0
  let previousEnded: number | null = null
  for (const event of sessionEvents) {
    const started = Number(event.started_at || 0)
    const ended = Number(event.ended_at || started)
    if (previousEnded !== null && started - previousEnded > 30 * 60 * 1000) {
      if (sessionListened > 0) sessionDurations.push(sessionListened)
      sessionListened = 0
    }
    sessionListened += Math.max(0, Number(event.listened_ms || 0))
    previousEnded = Math.max(previousEnded || 0, ended)
  }
  if (sessionListened > 0) sessionDurations.push(sessionListened)
  const avgSessionMs = sessionDurations.length
    ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
    : 0
  const longestSessionMs = sessionDurations.length ? Math.max(...sessionDurations) : 0

  const topArtistShare =
    Number(totals?.plays || 0) > 0 ? Number(topArtists?.[0]?.plays || 0) / Number(totals.plays) : 0
  const genreTotal = [...genresTotals.values()].reduce((a, b) => a + b, 0)
  let genreDiversityScore = 0
  if (genreTotal > 0 && genresTotals.size > 1) {
    const entropy = [...genresTotals.values()].reduce((sum, count) => {
      const p = count / genreTotal
      return sum - p * Math.log(p)
    }, 0)
    genreDiversityScore = Math.round((entropy / Math.log(genresTotals.size)) * 100)
  } else if (genreTotal > 0) genreDiversityScore = 0

  const derived = {
    repeat_plays: repeatPlays,
    repeat_rate: repeatRate,
    listening_days: listeningDays.length,
    longest_streak: longestStreak,
    avg_session_ms: Math.round(avgSessionMs),
    longest_session_ms: Math.round(longestSessionMs),
    top_artist_share: topArtistShare,
    genre_diversity_score: genreDiversityScore,
  }

  return {
    year,
    totals,
    topSongs,
    monthlyTopSongs,
    neverSkippedSongs,
    mostSkippedSongs,
    repeatStreaks,
    trendingSongs,
    topArtists,
    topAlbums,
    topGenres,
    genreStats,
    genreCount: genresTotals.size,
    genreAttributedPlays: Number(genreTotal.toFixed(3)),
    monthly,
    hourly,
    todayHourly,
    todayHourlySongs,
    devices,
    weekday,
    dailyCalendar,
    recentSongs,
    currentStreak,
    discoveredArtists: Number(discovery?.count || 0),
    derived,
  }
}

export function connectionStats() {
  return {
    connections: db
      .prepare(
        'SELECT id,server_url,server_id,server_name,jellyfin_user_id,username,updated_at FROM connections',
      )
      .all() as any[],
    openSessions: Number((db.prepare('SELECT COUNT(*) n FROM open_sessions').get() as any).n),
    events: Number((db.prepare('SELECT COUNT(*) n FROM play_events').get() as any).n),
  }
}

export default db
