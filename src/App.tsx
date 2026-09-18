import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Home,
  Info,
  Music2,
  Users,
  Disc3,
  Clock3,
  Compass,
  Settings,
  Play,
  RefreshCw,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Headphones,
  CheckCircle2,
  Crown,
  Star,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  AudioLines,
} from 'lucide-react'
import type {
  Session,
  Dashboard,
  Me,
  ArtistDetail,
  AlbumDetail,
  SongDetail,
  MediaInfo,
} from './types'
import { routeFromPath, pathForView, type View } from './lib/routes'
import {
  getHeroCopy,
  buildListeningInsights,
  listeningPersonality,
  greeting,
  topArtistSentences,
  PERSONALITY_BANDS,
} from './lib/narrative'
import { months, hourLabels, hourRanges } from './lib/constants'
import { formatNumber, formatMinutes, formatAxisHours, formatDayMonth } from './lib/format'
import { getUnlocks } from './lib/unlock'
import {
  resolveTheme,
  setTheme as persistTheme,
  applyTheme,
  watchSystemTheme,
  type Theme,
} from './lib/theme'
import { weekLockedCopy, pickCopy } from './lib/unlockCopy'
import { openJellyfinItem, setJellyfinUrlOverrides } from './lib/jellyfin-links'
import { Card, CardHeader, Stat, MetricCard, Brand, Locked } from './components/ui/primitives'
import { CustomDropdown } from './components/ui/CustomDropdown'
import { SongDetailModal } from './components/modals/SongDetailModal'
import { ArtistDetailModal } from './components/modals/ArtistDetailModal'
import { AlbumDetailModal } from './components/modals/AlbumDetailModal'
import { TopTracksPage } from './pages/TopTracksPage'
import { TopArtistsPage } from './pages/TopArtistsPage'
import { TopAlbumsPage } from './pages/TopAlbumsPage'
import { GenresPage } from './pages/GenresPage'
import { ActivityPage } from './pages/ActivityPage'
import { Login } from './pages/Login'
import { AdminSettings } from './pages/AdminSettings'
import { AboutPage } from './pages/AboutPage'
import { api, ApiError, endpoints } from './lib/api'
import { APP_VERSION } from './lib/version'
import { APP_TAGLINE, LogoIcon } from './lib/brand'
import { STORAGE_KEYS, safeStorage } from './lib/storage'

/** How often the dashboard silently refreshes its statistics. */
const DASHBOARD_POLL_MS = 30_000
/** How often the Jellyfin connection indicator is re-checked. */
const CONNECTION_POLL_MS = 15_000

/**
 * Title/artist for every song id the dashboard payload mentions. Lets a song
 * lookup that 404s (a stale id after Jellyfin reassigns one on a library
 * rescan) fall back to an exact name search — see endpoints.song's
 * title/artist params and the server-side fallback in GET /api/song/:itemId
 * and POST /api/media/batch.
 */
function buildSongMetaById(data: Dashboard | null) {
  const map = new Map<string, { title: string; artist: string }>()
  const add = (itemId: unknown, title: unknown, artist: unknown) => {
    const id = String(itemId || '')
    if (id && !map.has(id))
      map.set(id, { title: String(title || ''), artist: String(artist || '') })
  }
  for (const s of data?.recentSongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.todayHourlySongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.topSongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.monthlyTopSongs || []) if (s) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.neverSkippedSongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.mostSkippedSongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.repeatStreaks || []) add(s.item_id, s.track_title, s.artist_name)
  for (const s of data?.trendingSongs || []) add(s.item_id, s.track_title, s.artist_name)
  for (const g of data?.genreStats || [])
    if (g.topTrack) add(g.topTrack.item_id, g.topTrack.track_title, g.topTrack.artist_name)
  for (const a of data?.topArtists || [])
    if (a.favoriteTrack) add(a.favoriteTrack.item_id, a.favoriteTrack.title, a.artist_name)
  return map
}

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    let cancelled = false
    const raw = safeStorage.get(localStorage, STORAGE_KEYS.session)
    if (!raw) {
      setBooting(false)
      return
    }
    let saved: Session | null = null
    try {
      saved = JSON.parse(raw)
    } catch {
      safeStorage.remove(localStorage, STORAGE_KEYS.session)
    }
    if (!saved?.sessionId) {
      safeStorage.remove(localStorage, STORAGE_KEYS.session)
      setBooting(false)
      return
    }
    api
      .get<Me>(endpoints.me, { sessionId: saved.sessionId, noStore: true })
      .then(me => {
        if (cancelled) return
        setSession({
          ...saved!,
          user: me.user,
          jellyfinUrl: me.jellyfinUrl,
          serverName: me.serverName,
        })
        setBooting(false)
      })
      .catch(() => {
        if (cancelled) return
        safeStorage.remove(localStorage, STORAGE_KEYS.session)
        setSession(null)
        setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  if (booting)
    return (
      <div className="app-boot">
        <div className="boot-orbit">
          <div className="app-boot-mark">
            <LogoIcon size={26} strokeWidth={2.4} />
          </div>
        </div>
        <strong>Soundcheck</strong>
        <span className="boot-tagline">{APP_TAGLINE}</span>
        <span>Putting your listening story together…</span>
      </div>
    )
  if (!session) return <Login onLogin={setSession} />
  return (
    <DashboardPage
      session={session}
      onLogout={async () => {
        const id = session.sessionId
        safeStorage.remove(localStorage, STORAGE_KEYS.session)
        setSession(null)
        // Best effort — the local session is already gone either way.
        await api.post(endpoints.logout, undefined, { sessionId: id }).catch(() => {})
      }}
    />
  )
}

export function DashboardPage({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [view, setView] = useState<View>(() => routeFromPath(window.location.pathname))
  const [me, setMe] = useState<Me | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [media, setMedia] = useState<Record<string, MediaInfo>>({})
  const [profileOpen, setProfileOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(resolveTheme)
  // Until the user picks explicitly, keep following the OS if it changes mid-session.
  useEffect(
    () =>
      watchSystemTheme(next => {
        setThemeState(next)
        applyTheme(next)
      }),
    [],
  )
  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    persistTheme(next)
  }
  const [profileArtwork, setProfileArtwork] = useState<string | null>(null)
  const [listeningInsight, setListeningInsight] = useState('')
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null)
  const [songDetailLoading, setSongDetailLoading] = useState(false)
  const [songDetailError, setSongDetailError] = useState('')
  // The id play_events actually recorded, kept separate from songDetail.item.id
  // because the latter can be a *resolved* current Jellyfin id (see the
  // fallback in GET /api/song/:itemId) — refreshing must keep querying by the
  // originally requested id, or a resolved song's stats would look up nothing.
  const songDetailRequestedId = useRef('')
  const [favoriteSaving, setFavoriteSaving] = useState(false)
  const [favoritingIds, setFavoritingIds] = useState<Set<string>>(new Set())
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null)
  const [artistDetailLoading, setArtistDetailLoading] = useState(false)
  const [artistDetailError, setArtistDetailError] = useState('')
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null)
  const [albumDetailLoading, setAlbumDetailLoading] = useState(false)
  const [albumDetailError, setAlbumDetailError] = useState('')
  const listeningInsightInitialized = useRef(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  // Seeded eagerly rather than left null: `selectedYear` is a dependency of the
  // loader effect, so a null -> year transition after the first fetch re-ran the
  // whole load (dashboard, /me, and the media batch) a second time on every visit.
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())
  const year = selectedYear
  const yearAutoResolved = useRef(false)
  // The loader calls this on 401 but must not re-subscribe when the parent
  // re-renders and hands down a fresh closure.
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout
  // Media keys already requested from /api/media/batch this session.
  const mediaRequested = useRef(new Set<string>())

  async function load(silent = false) {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const d = await api.get<Dashboard>(endpoints.dashboard(year), {
        sessionId: session.sessionId,
      })
      setData(d)
      if (Array.isArray(d.years)) setAvailableYears(d.years)
      if (!yearAutoResolved.current) {
        yearAutoResolved.current = true
        // Only move off the current year when the newest tracked year is genuinely
        // different — otherwise this would set state to what it already is and
        // trigger a redundant second round of fetches.
        const initialYear = Array.isArray(d.years) && d.years.length ? Math.max(...d.years) : year
        if (initialYear !== year) setSelectedYear(initialYear)
      }
    } catch (e) {
      // An expired session logs out whether or not this was a background poll.
      if (e instanceof ApiError && e.status === 401) {
        onLogoutRef.current()
        return
      }
      if (!silent) setError(e instanceof Error ? e.message : 'Unable to load dashboard')
    } finally {
      if (!silent) setLoading(false)
    }
  }
  async function loadMe() {
    try {
      const d = await api.get<Me>(endpoints.me, {
        sessionId: session.sessionId,
        noStore: true,
      })
      setMe(d)
      setJellyfinUrlOverrides(d.jellyfinPublicUrl, d.jellyfinTailscaleUrl)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onLogoutRef.current()
        return
      }
      setMe(prev => (prev ? { ...prev, serverTracking: false } : prev))
    }
  }

  useEffect(() => {
    setProfileArtwork(me?.profileImage || null)
  }, [me?.profileImage])
  async function sync() {
    setSyncing(true)
    setError('')
    try {
      await api.post(endpoints.syncNow, undefined, { sessionId: session.sessionId })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }
  async function openSongDetails(itemId: string) {
    if (!itemId) return
    songDetailRequestedId.current = itemId
    setSongDetail(null)
    setSongDetailError('')
    setSongDetailLoading(true)
    try {
      const d = await api.get<SongDetail>(endpoints.song(itemId, year, songMetaById.get(itemId)), {
        sessionId: session.sessionId,
        noStore: true,
      })
      setSongDetail(d)
    } catch (e) {
      setSongDetailError(e instanceof Error ? e.message : 'Unable to load song details')
    } finally {
      setSongDetailLoading(false)
    }
  }

  async function refreshSongDetail(itemId: string) {
    if (!itemId) return
    try {
      const d = await api.get<SongDetail>(endpoints.song(itemId, year, songMetaById.get(itemId)), {
        sessionId: session.sessionId,
        noStore: true,
      })
      // Compare against the requested id, not prev.item.id — a resolved
      // (fallback-matched) song's item.id differs from the id it was
      // requested under, so that comparison would never match and this
      // refresh would silently be discarded every time.
      setSongDetail(prev => (prev && songDetailRequestedId.current === itemId ? d : prev))
    } catch {
      /* a background refresh failing leaves the open modal as it was */
    }
  }
  async function openArtistDetails(artistName: string) {
    if (!artistName) return
    setArtistDetail(null)
    setArtistDetailError('')
    setArtistDetailLoading(true)
    try {
      const d = await api.get<ArtistDetail>(endpoints.artist(artistName, year), {
        sessionId: session.sessionId,
        noStore: true,
      })
      setArtistDetail(d)
      const requests = (d.topSongs || [])
        .map((s: any) => `item:${s.item_id}`)
        .filter((key: string) => !media[key])
      if (requests.length) {
        const results = await Promise.all(
          requests.map(async (key: string) => {
            const info = await api.tryGet<MediaInfo>(endpoints.media(key.slice(5)), {
              sessionId: session.sessionId,
            })
            return [key, info] as const
          }),
        )
        setMedia(prev => {
          const next = { ...prev }
          for (const [key, value] of results) if (value) next[key] = value
          return next
        })
      }
    } catch (e) {
      setArtistDetailError(e instanceof Error ? e.message : 'Unable to load artist details')
    } finally {
      setArtistDetailLoading(false)
    }
  }

  async function openAlbumDetails(albumName: string, artistName: string) {
    if (!albumName) return
    setAlbumDetail(null)
    setAlbumDetailError('')
    setAlbumDetailLoading(true)
    setArtistDetail(null)
    setArtistDetailError('')
    try {
      const d = await api.get<AlbumDetail>(endpoints.album(albumName, year, artistName), {
        sessionId: session.sessionId,
        noStore: true,
      })
      setAlbumDetail(d)
      const requests = (d.topSongs || [])
        .map((song: any) => `item:${song.item_id}`)
        .filter((key: string) => !media[key])
      if (requests.length) {
        const results = await Promise.all(
          requests.map(async (key: string) => {
            const info = await api.tryGet<MediaInfo>(endpoints.media(key.slice(5)), {
              sessionId: session.sessionId,
              noStore: true,
            })
            return [key, info] as const
          }),
        )
        setMedia(prev => {
          const next = { ...prev }
          for (const [key, value] of results) if (value) next[key] = value
          return next
        })
      }
    } catch (e) {
      setAlbumDetailError(e instanceof Error ? e.message : 'Unable to load album details')
    } finally {
      setAlbumDetailLoading(false)
    }
  }

  async function openArtistSongInJellyfin(itemId: string) {
    if (!itemId) return
    const cached = media[`item:${itemId}`]
    if (cached?.jellyfinUrl) {
      openJellyfinItem(cached.jellyfinUrl)
      return
    }
    const info = await api.tryGet<MediaInfo>(endpoints.media(itemId), {
      sessionId: session.sessionId,
      noStore: true,
    })
    if (info?.jellyfinUrl) openJellyfinItem(info.jellyfinUrl)
  }

  async function toggleSongFavorite() {
    if (!songDetail || favoriteSaving) return
    setFavoriteSaving(true)
    try {
      const d = await api.post<{ favorite: boolean }>(
        endpoints.songFavorite(songDetail.item.id),
        { favorite: !songDetail.favorite },
        { sessionId: session.sessionId },
      )
      setSongDetail(prev => (prev ? { ...prev, favorite: Boolean(d.favorite) } : prev))
    } catch (e) {
      setSongDetailError(e instanceof Error ? e.message : 'Unable to update favorite')
    } finally {
      setFavoriteSaving(false)
    }
  }

  async function toggleItemFavorite(itemId: string, current: boolean) {
    if (favoritingIds.has(itemId)) return
    setFavoritingIds(prev => new Set(prev).add(itemId))
    try {
      const d = await api.post<{ favorite: boolean }>(
        endpoints.songFavorite(itemId),
        { favorite: !current },
        { sessionId: session.sessionId },
      )
      setMedia(prev => ({
        ...prev,
        [`item:${itemId}`]: {
          ...prev[`item:${itemId}`],
          favorite: Boolean(d.favorite),
        } as MediaInfo,
      }))
      if (songDetail?.item.id === itemId)
        setSongDetail(prev => (prev ? { ...prev, favorite: Boolean(d.favorite) } : prev))
    } catch {
    } finally {
      setFavoritingIds(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  useEffect(() => {
    load()
    loadMe()
    const statsTimer = window.setInterval(() => load(true), DASHBOARD_POLL_MS)
    const connectionTimer = window.setInterval(() => loadMe(), CONNECTION_POLL_MS)
    return () => {
      clearInterval(statsTimer)
      clearInterval(connectionTimer)
    }
  }, [session.sessionId, selectedYear])

  useEffect(() => {
    if (!data) return
    listeningInsightInitialized.current = false
    listeningInsightInitialized.current = true
    const choices = buildListeningInsights(data)
    const stored = Number(safeStorage.get(sessionStorage, STORAGE_KEYS.lastInsight))
    let index = Math.floor(Math.random() * choices.length)
    if (
      choices.length > 1 &&
      Number.isInteger(stored) &&
      stored >= 0 &&
      stored < choices.length &&
      index === stored
    ) {
      index = (index + 1) % choices.length
    }
    safeStorage.set(sessionStorage, STORAGE_KEYS.lastInsight, String(index))
    setListeningInsight(choices[index])
  }, [data?.year])

  useEffect(() => {
    if (!data) return
    let cancelled = false
    const loadMedia = async () => {
      try {
        // De-duplicated before anything else: the server caps a single batch at
        // MAX_BATCH_ITEM_IDS ids, and a repeated id (the same song shows up in
        // topSongs, recentSongs, neverSkipped, ...) would otherwise burn that
        // budget several times over and starve later sections of a slot.
        const wantedItemIds = [
          ...new Set(
            [
              ...(data.recentSongs || []).map((x: any) => x.item_id),
              ...(data.todayHourlySongs || []).map((x: any) => x.item_id),
              ...(data.genreStats || [])
                .slice(0, 5)
                .flatMap((g: any) => (g.topTrack?.item_id ? [g.topTrack.item_id] : [])),
              ...(data.topSongs || []).slice(0, 50).map((x: any) => x.item_id),
              ...(data.monthlyTopSongs || []).flatMap((x: any) => (x?.item_id ? [x.item_id] : [])),
              ...(data.neverSkippedSongs || []).map((x: any) => x.item_id),
              ...(data.mostSkippedSongs || []).map((x: any) => x.item_id),
              ...(data.repeatStreaks || []).map((x: any) => x.item_id),
              ...(data.trendingSongs || []).map((x: any) => x.item_id),
              ...(data.topArtists || [])
                .slice(0, 20)
                .flatMap((x: any) => (x.favoriteTrack?.item_id ? [x.favoriteTrack.item_id] : [])),
            ].filter(Boolean),
          ),
        ]
        const wantedArtists = [
          ...new Set(
            [
              ...(data.topArtists || []).slice(0, 20).map((x: any) => x.artist_name),
              ...(data.genreStats || [])
                .slice(0, 5)
                .flatMap((g: any) => (g.topArtist?.artist_name ? [g.topArtist.artist_name] : [])),
            ].filter(Boolean),
          ),
        ]
        const wantedAlbums = (data.topAlbums || [])
          .slice(0, 20)
          .map((x: any) => ({
            name: String(x.album_name || ''),
            artist: String(x.artist_name || ''),
          }))
          .filter((x: any) => x.name)

        // Artwork is immutable once resolved, so ask only for what we haven't
        // already fetched. Without this the full batch (100+ lookups, ~1.4s) was
        // re-issued on every 30s background poll.
        const seen = mediaRequested.current
        const itemIds = wantedItemIds.filter((id: string) => !seen.has('item:' + id))
        const artistNames = wantedArtists.filter((n: string) => !seen.has('artist:' + n))
        const albums = wantedAlbums.filter((a: any) => !seen.has(`album:${a.name}::${a.artist}`))
        if (!itemIds.length && !artistNames.length && !albums.length) return

        // Title/artist per id, so the server can fall back to a name search for
        // any id it no longer recognizes (see /api/media/batch and the matching
        // fallback in GET /api/song/:itemId).
        const songMeta = buildSongMetaById(data)
        const items = itemIds.map((id: string) => ({ id, ...songMeta.get(id) }))

        const result = await api.post<{
          items?: Record<string, MediaInfo>
          artists?: Record<string, MediaInfo>
          albums?: Record<string, MediaInfo>
        }>(endpoints.mediaBatch, { items, artistNames, albums }, { sessionId: session.sessionId })
        if (cancelled) return
        // Only mark an id as fetched once the server actually answered for it —
        // not just because it was in the request. The batch endpoint silently
        // truncates to MAX_BATCH_ITEM_IDS/MAX_BATCH_NAMES; marking every
        // requested id as "seen" regardless would permanently blacklist
        // whatever got truncated out, instead of letting the next poll retry it.
        itemIds.forEach((id: string) => {
          if (result.items?.[`item:${id}`]) seen.add('item:' + id)
        })
        artistNames.forEach((n: string) => {
          if (result.artists?.[`artist:${n}`]) seen.add('artist:' + n)
        })
        albums.forEach((a: any) => {
          const key = `album:${a.name}::${a.artist}`
          if (result.albums?.[key]) seen.add(key)
        })
        setMedia(prev => ({
          ...prev,
          ...result.items,
          ...result.artists,
          ...result.albums,
        }))
      } catch {}
    }
    loadMedia()
    return () => {
      cancelled = true
    }
  }, [data, session.sessionId])

  const songMetaById = useMemo(() => buildSongMetaById(data), [data])

  const totals = data?.totals
  const minutes = Math.round((totals?.listened_ms || 0) / 60000)
  const topArtist = data?.topArtists?.[0]
  const topAlbum = data?.topAlbums?.[0]
  const topGenre = data?.topGenres?.[0]
  const derived = data?.derived
  const topArtistSharePct = Math.round((derived?.top_artist_share || 0) * 100)
  // Personality reads play counts (not listened_ms) for the time axis, so a long
  // album left running does not outvote the hours you actually reach for music.
  const personality = useMemo(() => {
    const hourPlays = Array.from({ length: 24 }, (_, i) =>
      Number(data?.hourly?.find((x: any) => Number(x.hour) === i)?.plays || 0),
    )
    const hourTotalPlays = hourPlays.reduce((a, b) => a + b, 0)
    const peakHour = hourPlays.reduce((best, v, i) => (v > hourPlays[best] ? i : best), 0)
    const band =
      PERSONALITY_BANDS.find(b => peakHour >= b.from && peakHour <= b.to) || PERSONALITY_BANDS[4]
    const bandPlays = hourPlays.slice(band.from, band.to + 1).reduce((a, b) => a + b, 0)
    const weekMs = (data?.weekday || []).reduce((a, d) => a + Number(d.listened_ms || 0), 0)
    const weekendMs =
      Number(data?.weekday?.[5]?.listened_ms || 0) + Number(data?.weekday?.[6]?.listened_ms || 0)
    const genrePlays = Number(data?.genreAttributedPlays || 0)
    return listeningPersonality({
      repeatRate: Number(derived?.repeat_rate || 0),
      diversityScore: Number(derived?.genre_diversity_score || 0),
      peakHour,
      peakBandSharePct: hourTotalPlays > 0 ? Math.round((bandPlays / hourTotalPlays) * 100) : 0,
      weekendSharePct: weekMs > 0 ? Math.round((weekendMs / weekMs) * 100) : 0,
      longestStreak: Number(derived?.longest_streak || 0),
      avgSessionMs: Number(derived?.avg_session_ms || 0),
      longestSessionMs: Number(derived?.longest_session_ms || 0),
      plays: Number(totals?.plays || 0),
      uniqueTracks: Number(totals?.unique_tracks || 0),
      uniqueArtists: Number(totals?.unique_artists || 0),
      listeningDays: Number(derived?.listening_days || 0),
      discoveredArtists: Number(data?.discoveredArtists || 0),
      topArtistName: topArtist?.artist_name || '',
      topArtistPlays: Number(topArtist?.plays || 0),
      topArtistSharePct,
      topGenre: topGenre?.genre || '',
      topGenreSharePct:
        genrePlays > 0 ? Math.round((Number(topGenre?.count || 0) / genrePlays) * 100) : 0,
      genreCount: Number(data?.genreCount || 0),
      skipRatePct:
        Number(totals?.plays || 0) > 0
          ? Math.round((Number(totals?.skips || 0) / Number(totals?.plays || 1)) * 100)
          : 0,
      completionPct: Math.round(Number(totals?.avg_completion || 0) * 100),
    })
  }, [data, derived, totals, topArtist, topGenre, topArtistSharePct])
  // The #1 album's own most-played track. Only the global top songs are in the
  // payload, so this is empty when none of that album's tracks made the list.
  const albumTopTrack = useMemo(() => {
    if (!topAlbum?.album_name) return null
    return (data?.topSongs || []).find(s => s.album_name === topAlbum.album_name) || null
  }, [data, topAlbum])
  // "Various Artists" is a tagging artifact, not someone you listened to — it
  // would read as a real person in a grid of faces.
  const exploredArtists = useMemo(
    () =>
      (data?.topArtists || [])
        .filter(a => a.artist_name && a.artist_name.trim().toLowerCase() !== 'various artists')
        .slice(0, 8),
    [data],
  )
  const [evidenceIndex, setEvidenceIndex] = useState(0)
  useEffect(() => {
    setEvidenceIndex(0)
  }, [personality.evidence])
  const topArtistCompletionPct = Math.round((topArtist?.avgCompletion || 0) * 100)
  const secondArtist = data?.topArtists?.[1]
  const topArtistLead =
    topArtist && secondArtist ? Number(topArtist.plays || 0) - Number(secondArtist.plays || 0) : 0
  const topArtistFirstPlayedLabel = topArtist?.firstPlayed
    ? formatDayMonth(topArtist.firstPlayed, { long: true })
    : ''
  const topArtistSentence = useMemo(() => {
    if (!topArtist) return ''
    const options = topArtistSentences(
      topArtist.artist_name,
      topArtistSharePct,
      topArtistCompletionPct,
      topArtist.uniqueSongs || 0,
      topArtistFirstPlayedLabel,
      secondArtist?.artist_name,
      topArtistLead,
    )
    return options[Math.floor(Math.random() * options.length)]
  }, [
    topArtist,
    topArtistSharePct,
    topArtistCompletionPct,
    topArtistFirstPlayedLabel,
    secondArtist,
    topArtistLead,
  ])
  const monthly = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, i) => data?.monthly?.find(x => Number(x.month) === i + 1)?.listened_ms || 0,
      ),
    [data],
  )
  const maxMonth = Math.max(...monthly, 1)
  const monthlyAxis = useMemo(() => {
    const hours = maxMonth / 3600000
    const step = hours <= 4 ? 1 : hours <= 10 ? 2 : hours <= 25 ? 5 : 10
    const axisMax = Math.max(step, Math.ceil(hours / step) * step)
    const labelCount = axisMax / step
    return {
      axisMax,
      step,
      labels: Array.from({ length: labelCount + 1 }, (_, i) => axisMax - i * step),
    }
  }, [maxMonth])
  const hourly = useMemo(
    () =>
      Array.from(
        { length: 24 },
        (_, i) => data?.hourly?.find(x => Number(x.hour) === i)?.listened_ms || 0,
      ),
    [data],
  )
  const hourBuckets = hourLabels.map((label, i) => ({
    label,
    value: hourly.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0),
  }))
  const hourTotal = Math.max(
    hourBuckets.reduce((a, b) => a + b.value, 0),
    1,
  )
  const peak = hourBuckets.reduce((a, b) => (b.value > a.value ? b : a), hourBuckets[0])
  // The "Listening Overview" card used to restate the hero's total minutes/plays; these
  // give it its own facts (average per active day, best month) instead of repeating them.
  const bestMonthIdx = monthly.reduce((best, v, i) => (v > monthly[best] ? i : best), 0)
  const unlocks = useMemo(
    () => getUnlocks(data?.trackingStartedAt, data?.unlockOverride),
    [data?.trackingStartedAt, data?.unlockOverride],
  )
  const weekLockedMessage = useMemo(
    () => pickCopy(weekLockedCopy(unlocks.daysUntil.week)),
    [unlocks.daysUntil.week],
  )
  const avgPerDayMs = derived?.listening_days
    ? (totals?.listened_ms || 0) / derived.listening_days
    : 0

  // Each entry carries its own route: the order here is presentation only and
  // can be changed freely without re-pointing anything.
  const navItems = [
    [Home, 'Dashboard', 'home'],
    [Clock3, 'Activity', 'activity'],
    [Music2, 'Top Tracks', 'top-tracks'],
    [Disc3, 'Top Albums', 'top-albums'],
    [Users, 'Top Artists', 'top-artists'],
    [Compass, 'Genres', 'genres'],
  ] as const
  useEffect(() => {
    const handlePopState = () => setView(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    const path = window.location.pathname
    if (path === '/' || path === '') window.history.replaceState({}, '', '/dashboard')
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const navigate = (next: View) => {
    const path = pathForView(next)
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setView(next)
    setMobileNav(false)
  }
  const navigation = (
    <nav>
      {navItems.map(([Icon, label, target]) => {
        const I = Icon as any
        return (
          <button
            className={'nav-item ' + (view === target ? 'active' : '')}
            key={target}
            onClick={() => navigate(target)}
          >
            <I size={18} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
  if (view === 'settings' && session.user.isAdministrator)
    return (
      <AdminSettings
        session={session}
        me={me}
        onBack={() => navigate('home')}
        onLogout={onLogout}
        trackingStartedAt={data?.trackingStartedAt}
        unlockOverride={data?.unlockOverride || false}
        onUnlockOverrideChanged={() => load()}
      />
    )

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={'sidebar ' + (mobileNav ? 'mobile-open' : '')}>
        <div className="mobile-drawer-top">
          <Brand />
          <button
            className="mobile-close"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <Brand desktop />
        <div className="sidebar-user">
          <div className="avatar avatar-photo">
            {profileArtwork ? (
              <img src={profileArtwork} alt="" loading="lazy" decoding="async" />
            ) : (
              session.user.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="sidebar-user-copy">
            <strong>Hi, {session.user.name}!</strong>
            <small>{session.serverName || 'Jellyfin server'}</small>
          </div>
          <span className={'online ' + (me?.serverTracking ? '' : 'offline')} />
        </div>
        {session.user.isAdministrator && (
          <div className={'tracking-badge ' + (me?.serverTracking ? '' : 'not-syncing')}>
            <span>●</span>{' '}
            {me?.serverTracking ? 'Connected to Jellyfin' : 'Not Connected to Jellyfin'}
          </div>
        )}
        <div className="nav-label">YOUR SOUNDCHECK</div>
        {navigation}
        <div className="nav-bottom">
          <button
            className={'nav-item ' + (view === 'about' ? 'active' : '')}
            onClick={() => navigate('about')}
          >
            <Info size={18} />
            <span>About</span>
          </button>
          {session.user.isAdministrator && (
            <button
              className={'nav-item ' + (view === 'settings' ? 'active' : '')}
              onClick={() => navigate('settings')}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          )}
        </div>
        <div className="sidebar-footer">
          <span className="footer-star">
            <LogoIcon size={16} strokeWidth={2.4} />
          </span>
          <div>
            <b>Soundcheck</b>
            <small>{APP_TAGLINE}</small>
            <button
              type="button"
              className="footer-version footer-version-link"
              title="About Soundcheck"
              onClick={() => navigate('about')}
            >
              v{APP_VERSION}
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}>
            <Menu size={21} />
          </button>
          <div className="topbar-title">
            <span>
              {view === 'top-tracks'
                ? 'Top Tracks'
                : view === 'top-artists'
                  ? 'Top Artists'
                  : view === 'top-albums'
                    ? 'Top Albums'
                    : view === 'genres'
                      ? 'Genres'
                      : view === 'activity'
                        ? 'Activity'
                        : view === 'about'
                          ? 'About'
                          : 'Dashboard'}
            </span>
            <small>
              {view === 'about' ? `Soundcheck v${APP_VERSION}` : `${year} listening story`}
            </small>
          </div>
          <div className="topbar-spacer" />
          {availableYears.length > 0 && view !== 'about' && (
            <CustomDropdown
              value={year}
              options={availableYears}
              onChange={v => setSelectedYear(Number(v))}
              ariaLabel="Year"
              className="topbar-year"
            />
          )}
          <div className="profile-menu">
            <button
              className="avatar small avatar-button"
              aria-label="Open account menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen(v => !v)}
            >
              {profileArtwork ? (
                <img src={profileArtwork} alt="" loading="lazy" decoding="async" />
              ) : (
                session.user.name.slice(0, 1).toUpperCase()
              )}
            </button>
            <div className="profile-popover">
              <div className="profile-popover-head">
                <div className="avatar small">
                  {profileArtwork ? (
                    <img src={profileArtwork} alt="" loading="lazy" decoding="async" />
                  ) : (
                    session.user.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div>
                  <strong>{session.user.name}</strong>
                  <small>{session.serverName || 'Jellyfin server'}</small>
                </div>
              </div>
              <button
                type="button"
                className="profile-theme"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />} Dark mode
                <span
                  className={'profile-switch ' + (theme === 'dark' ? 'on' : '')}
                  aria-hidden="true"
                >
                  <span />
                </span>
              </button>
              <div className="profile-divider" />
              <button
                onClick={() => {
                  navigate('about')
                  setProfileOpen(false)
                }}
              >
                <Info size={15} /> About
              </button>
              {session.user.isAdministrator && (
                <button
                  onClick={() => {
                    navigate('settings')
                    setProfileOpen(false)
                  }}
                >
                  <Settings size={15} /> Settings
                </button>
              )}
              <button className="profile-disconnect" onClick={onLogout}>
                <LogOut size={15} /> Log Out
              </button>
            </div>
          </div>
        </header>

        {view === 'home' && (
          <section className="hero">
            <div className="hero-bubbles bubble-a" />
            <div className="hero-bubbles bubble-b" />
            <div className={'hero-art ' + (profileArtwork ? 'has-profile' : '')}>
              {profileArtwork ? (
                <img className="hero-profile" src={profileArtwork} alt="" />
              ) : (
                <>
                  <div className="art-head">♪</div>
                  <div className="art-ear one" />
                  <div className="art-ear two" />
                  <span className="art-note n1">♪</span>
                  <span className="art-note n2">♫</span>
                </>
              )}
            </div>
            <div className="hero-copy">
              <div className="eyebrow">
                <AudioLines size={14} /> {APP_TAGLINE.toUpperCase()}
              </div>
              <h1>
                Good {greeting()}, {session.user.name}! <span>♪</span>
              </h1>
              <p>
                {getHeroCopy(year, Boolean(totals?.plays), data?.trackingStartedAt || Date.now())}
              </p>
              {session.user.isAdministrator && (
                <button onClick={sync} disabled={syncing}>
                  <RefreshCw size={15} className={syncing ? 'spin' : ''} />{' '}
                  {syncing ? 'Refreshing…' : 'Refresh my Soundcheck'}
                </button>
              )}
            </div>
            <div className="hero-stats">
              <Stat
                value={formatNumber(minutes)}
                label="minutes listened"
                icon={<Headphones size={18} />}
              />
              <Stat
                value={formatNumber(totals?.plays || 0)}
                label="plays"
                icon={<Play size={17} fill="currentColor" />}
              />
              <Stat
                value={formatNumber(totals?.unique_artists || 0)}
                label="artists"
                icon={<Users size={18} />}
              />
              <Stat
                value={formatNumber(totals?.unique_tracks || 0)}
                label="songs"
                icon={<Music2 size={18} />}
              />
            </div>
          </section>
        )}

        {error && (
          <div className="data-error">
            <span>{error}</span>
            <button onClick={() => load()}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}
        {view === 'about' ? (
          <AboutPage session={session} me={me} />
        ) : loading ? (
          <div className="loading-card">
            <div className="loading-dot" /> Loading your listening history…
          </div>
        ) : view === 'top-tracks' ? (
          <TopTracksPage
            data={data}
            media={media}
            onSongClick={openSongDetails}
            onToggleFavorite={toggleItemFavorite}
            favoritingIds={favoritingIds}
            trackingStartedAt={data?.trackingStartedAt || Date.now()}
          />
        ) : view === 'top-artists' ? (
          <TopArtistsPage
            data={data}
            media={media}
            onArtistClick={openArtistDetails}
            trackingStartedAt={data?.trackingStartedAt || Date.now()}
          />
        ) : view === 'top-albums' ? (
          <TopAlbumsPage data={data} media={media} onAlbumClick={openAlbumDetails} />
        ) : view === 'genres' ? (
          <GenresPage data={data} media={media} session={session} />
        ) : view === 'activity' ? (
          <ActivityPage data={data} media={media} session={session} onSongClick={openSongDetails} />
        ) : (
          <>
            <section className="stats-grid">
              <MetricCard
                icon={<RefreshCw size={20} />}
                title="Repeat Rate"
                value={`${Math.round((derived?.repeat_rate || 0) * 100)}%`}
                change={`${formatNumber(derived?.repeat_plays || 0)} repeat plays`}
                tone="mint"
              />
              <MetricCard
                icon={<Clock3 size={20} />}
                title="Listening Days"
                value={formatNumber(derived?.listening_days || 0)}
                change="Different days with music"
                tone="peach"
              />
              <MetricCard
                icon={<Crown size={20} />}
                title="Longest Streak"
                value={`${formatNumber(derived?.longest_streak || 0)} days`}
                change="Consecutive listening days"
                tone="yellow"
              />
              <MetricCard
                icon={<CheckCircle2 size={20} />}
                title="Avg. Completion"
                value={`${Math.round((totals?.avg_completion || 0) * 100)}%`}
                change="How much you usually hear"
                tone="blue"
              />
            </section>

            <section className="dashboard-grid top-grid">
              <Card className="recent-card">
                <CardHeader
                  title="Top Tracks"
                  link="View all"
                  onLink={() => setView('top-tracks')}
                />
                <ol className="music-list">
                  {(data?.topSongs || []).slice(0, 5).map((s, i) => {
                    const m = media[`item:${s.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork || undefined
                    return (
                      <li
                        key={s.item_id}
                        className="music-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => openSongDetails(s.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') openSongDetails(s.item_id)
                        }}
                      >
                        <span className="rank">{i + 1}</span>
                        <div className="mini-cover">
                          {artwork ? (
                            <img src={artwork} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span>
                              {i === 0 ? '♬' : i === 1 ? '◒' : i === 2 ? '♫' : i === 3 ? '◌' : '♪'}
                            </span>
                          )}
                        </div>
                        <div className="list-text">
                          <b>{s.track_title || 'Untitled track'}</b>
                          <small>{s.artist_name || 'Unknown artist'}</small>
                        </div>
                        <strong className="play-count">{s.plays}</strong>
                        <ChevronRight size={14} className="music-row-chevron" />
                      </li>
                    )
                  })}
                </ol>
                {!data?.topSongs?.length && (
                  <Locked message="No plays yet. Start listening in Jellyfin and your Soundcheck will grow here." />
                )}
              </Card>
              <Card
                className="top-artist-card clickable-card"
                onClick={() => topArtist && openArtistDetails(topArtist.artist_name)}
              >
                <div className="card-header">
                  <h3>Your Top Artist</h3>
                  <span className="tiny-badge">#1</span>
                </div>
                <div className="artist-top-row">
                  <div className="artist-portrait">
                    {media[`artist:${topArtist?.artist_name || ''}`]?.artwork ? (
                      <img
                        src={media[`artist:${topArtist?.artist_name || ''}`].artwork || undefined}
                        alt=""
                      />
                    ) : (
                      <>
                        <div className="portrait-glow" />
                        <div className="portrait-note">♫</div>
                      </>
                    )}
                  </div>
                  <div className="artist-info">
                    {topArtist && topArtistSentence && (
                      <p className="artist-sentence">{topArtistSentence}</p>
                    )}
                    <h2>{topArtist?.artist_name || 'Your story is starting'}</h2>
                    <span>
                      {topArtist ? formatMinutes(topArtist.listened_ms) : 'No listening data yet'}
                    </span>
                  </div>
                </div>
                {topArtist && (
                  <div className="artist-chips">
                    <div className="artist-chip">
                      <strong>{formatNumber(topArtist.plays || 0)}</strong>
                      <span>Total Plays</span>
                    </div>
                    <div className="artist-chip">
                      <strong>{formatNumber(topArtist.uniqueSongs || 0)}</strong>
                      <span>Unique Songs</span>
                    </div>
                    <div className="artist-chip">
                      <strong>{topArtistCompletionPct}%</strong>
                      <span>Avg. Completion</span>
                    </div>
                  </div>
                )}
                {topArtist?.favoriteTrack &&
                  (() => {
                    const favoriteTrack = topArtist.favoriteTrack
                    const favArt = media[`item:${favoriteTrack.item_id || ''}`]
                    const favArtwork = favArt?.artwork || favArt?.albumArtwork
                    return (
                      <div
                        className="artist-fav-spot"
                        role="button"
                        tabIndex={0}
                        onClick={e => {
                          e.stopPropagation()
                          openSongDetails(favoriteTrack.item_id)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            openSongDetails(favoriteTrack.item_id)
                          }
                        }}
                      >
                        <div className="artist-fav-cover">
                          {favArtwork ? (
                            <img src={favArtwork} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <Music2 size={16} />
                          )}
                        </div>
                        <div className="artist-fav-body">
                          <div className="artist-fav-eyebrow">
                            <Star size={9} fill="currentColor" /> Favourite track
                          </div>
                          <div className="artist-fav-title">{favoriteTrack.title}</div>
                        </div>
                        <div className="artist-fav-plays">
                          {formatNumber(favoriteTrack.plays)} plays
                        </div>
                      </div>
                    )
                  })()}
              </Card>
            </section>

            <section className="dashboard-grid chart-grid">
              <Card className="activity-card">
                <CardHeader title="Listening Overview" link="This year" />
                <div className="chart-summary">
                  <div>
                    <strong>{avgPerDayMs ? formatMinutes(avgPerDayMs) : '—'}</strong>
                    <span>average per active day</span>
                  </div>
                  <div className="trend-up">
                    ♪{' '}
                    {!monthly[bestMonthIdx]
                      ? 'Start your first play'
                      : unlocks.monthly
                        ? `Best month: ${months[bestMonthIdx]}`
                        : `Best month unlocks in ${unlocks.daysUntil.monthly}d`}
                  </div>
                </div>
                <div className="chart">
                  <div className="y-axis">
                    {monthlyAxis.labels.map((v, i) => (
                      <span key={i}>{v === 0 ? '0' : formatAxisHours(v)}</span>
                    ))}
                  </div>
                  <div className="bars">
                    {monthly.map((v, i) => (
                      <div className="bar-wrap" key={i}>
                        <span
                          className="bar"
                          style={{
                            height: v
                              ? `${Math.max(2, (v / 3600000 / monthlyAxis.axisMax) * 100)}%`
                              : '0%',
                          }}
                          title={`${months[i]}: ${formatMinutes(v)}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="months">
                    {months.map(m => (
                      <small key={m}>{m}</small>
                    ))}
                  </div>
                </div>
              </Card>
              <Card className="genre-card-panel">
                <CardHeader title="Top Genres" link="By plays" />
                {topGenre ? (
                  <div className="genre-visual">
                    <div className="donut-ring">
                      <div>
                        <strong>
                          {Math.round((topGenre.count / Math.max(totals?.plays || 1, 1)) * 100)}%
                        </strong>
                        <small>{topGenre.genre}</small>
                      </div>
                    </div>
                    <div className="genre-list">
                      {(data?.topGenres || []).slice(0, 5).map((g, i) => (
                        <div key={g.genre}>
                          <i className={`dot dot-${i + 1}`} />
                          <span>{g.genre}</span>
                          <b>{Math.round((g.count / Math.max(totals?.plays || 1, 1)) * 100)}%</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Locked message="No plays yet. Your top genres will show up here once you start listening." />
                )}
              </Card>
            </section>

            <section className="dashboard-grid insight-grid">
              <Card
                className="album-card clickable-card"
                onClick={() =>
                  topAlbum && openAlbumDetails(topAlbum.album_name, topAlbum.artist_name)
                }
              >
                <CardHeader title="Your #1 Album" />
                <div className="album-feature">
                  <div className="album-art">
                    {media[`album:${topAlbum?.album_name || ''}`]?.artwork ? (
                      <img
                        src={media[`album:${topAlbum?.album_name || ''}`].artwork || undefined}
                        alt=""
                      />
                    ) : (
                      <>
                        <div>◐</div>
                        <span>SOUNDCHECK</span>
                      </>
                    )}
                  </div>
                  <div>
                    <small>Most listened album</small>
                    <h2>{topAlbum?.album_name || 'Waiting for your next favorite'}</h2>
                    <p>
                      {topAlbum?.artist_name || 'Jellyfin'} ·{' '}
                      {topAlbum ? formatMinutes(topAlbum.listened_ms) : '—'}
                    </p>
                  </div>
                </div>
                {topAlbum && (
                  <div className="album-strip">
                    <div>
                      <b>{formatNumber(topAlbum.plays || 0)}</b>
                      <span>PLAYS</span>
                    </div>
                    <div>
                      <b>{formatNumber(topAlbum.unique_songs || 0)}</b>
                      <span>SONGS</span>
                    </div>
                    <div>
                      <b>{formatMinutes(topAlbum.listened_ms)}</b>
                      <span>LISTENED</span>
                    </div>
                  </div>
                )}
                {albumTopTrack &&
                  (() => {
                    const art = media[`item:${albumTopTrack.item_id}`]
                    const cover = art?.artwork || art?.albumArtwork
                    return (
                      <div className="album-track">
                        <small>MOST PLAYED FROM THIS ALBUM</small>
                        <div
                          className="album-track-row"
                          role="button"
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation()
                            openSongDetails(albumTopTrack.item_id)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              openSongDetails(albumTopTrack.item_id)
                            }
                          }}
                        >
                          <div className="album-track-cover">
                            {cover ? (
                              <img src={cover} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <Music2 size={14} />
                            )}
                          </div>
                          <strong>{albumTopTrack.track_title}</strong>
                          <em>{formatNumber(albumTopTrack.plays)} plays</em>
                          <ChevronRight size={13} />
                        </div>
                      </div>
                    )
                  })()}
              </Card>
              <Card className="discovery-card">
                <CardHeader title="Artists Explored" />
                <div className="discovery-main">
                  <strong>{formatNumber(data?.discoveredArtists || 0)}</strong>
                  <span>
                    artists you've played
                    <br />
                    this year
                  </span>
                </div>
                <div className="artist-faces">
                  {exploredArtists.map(a => {
                    const art = media[`artist:${a.artist_name}`]?.artwork
                    return (
                      <button
                        type="button"
                        key={a.artist_name}
                        className="artist-face"
                        onClick={() => openArtistDetails(a.artist_name)}
                      >
                        <i>
                          {art ? (
                            <img src={art} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span>{a.artist_name.trim().charAt(0).toUpperCase()}</span>
                          )}
                        </i>
                        <span>{a.artist_name}</span>
                        <u>{formatNumber(a.plays || 0)} plays</u>
                      </button>
                    )
                  })}
                </div>
                {!exploredArtists.length && (
                  <Locked message="No plays yet. Start listening in Jellyfin and your Soundcheck will grow here." />
                )}
              </Card>
              <Card className="personality-card">
                <CardHeader title="Listening Personality" />
                {unlocks.week ? (
                  <div className={`personality-inner band-${personality.band}`}>
                    <div className="personality-icon">
                      {personality.band === 'late-night' || personality.band === 'night' ? (
                        <Moon size={22} />
                      ) : personality.band === 'dawn' ? (
                        <Sunrise size={22} />
                      ) : personality.band === 'evening' ? (
                        <Sunset size={22} />
                      ) : (
                        <Sun size={22} />
                      )}
                    </div>
                    <div>
                      <small>YOUR SOUND</small>
                      <h2>{personality.name}</h2>
                      <p>{personality.text}</p>
                    </div>
                    {personality.evidence.length > 0 && (
                      <div className="personality-why">
                        <small>WHY</small>
                        <p>{personality.evidence[evidenceIndex % personality.evidence.length]}</p>
                        {personality.evidence.length > 1 && (
                          <div className="personality-dots">
                            {personality.evidence.map((_, i) => (
                              <button
                                key={i}
                                type="button"
                                className={
                                  i === evidenceIndex % personality.evidence.length ? 'on' : ''
                                }
                                aria-label={`Reason ${i + 1} of ${personality.evidence.length}`}
                                onClick={() => setEvidenceIndex(i)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="personality-stats">
                      <div>
                        <b>{Math.round((derived?.top_artist_share || 0) * 100)}%</b>
                        <span>top artist share</span>
                      </div>
                      <div>
                        <b>{derived?.genre_diversity_score || 0}</b>
                        <span>taste diversity</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Locked
                    message={weekLockedMessage}
                    elapsedDays={unlocks.elapsedDays}
                    threshold={7}
                  />
                )}
              </Card>
            </section>

            <section className="dashboard-grid time-grid">
              <Card className="hour-card">
                <CardHeader title="When You Listen" link={me?.timezone || 'Server time'} />
                <div className="hour-intro">
                  <div>
                    <strong>
                      {peak?.value
                        ? hourLabels[hourBuckets.indexOf(peak)]
                        : 'No listening pattern yet'}
                    </strong>
                    <span>
                      {peak?.value
                        ? `Your listening peaks around ${hourRanges[hourBuckets.indexOf(peak)]}.`
                        : 'Keep listening and Soundcheck will find your peak.'}
                    </span>
                  </div>
                  <div className="peak-badge">
                    {peak?.value
                      ? `${Math.round((peak.value / hourTotal) * 100)}% peak`
                      : 'No data'}
                  </div>
                </div>
                <div className="hour-bars">
                  {hourBuckets.map((x, i) => {
                    const pct = Math.round((x.value / hourTotal) * 100)
                    return (
                      <div className={'hour-row ' + (x === peak ? 'peak' : '')} key={x.label}>
                        <div className="hour-label">
                          <span>{hourLabels[i]}</span>
                          <small>{hourRanges[i]}</small>
                        </div>
                        <div className="hour-track">
                          <span style={{ width: `${x.value ? Math.max(4, pct) : 0}%` }} />
                        </div>
                        <b>{pct}%</b>
                      </div>
                    )
                  })}
                </div>
                <div className="habit-strip">
                  <div>
                    <b>{formatMinutes(derived?.avg_session_ms || 0)}</b>
                    <span>average session</span>
                  </div>
                  <div>
                    <b>{formatMinutes(derived?.longest_session_ms || 0)}</b>
                    <span>longest session</span>
                  </div>
                </div>
              </Card>
              <Card className="insight-line-card">
                <CardHeader title="Your Soundcheck in one line" />
                <div className="one-line">
                  <div className="quote-mark">“</div>
                  <p>
                    {listeningInsight || 'Your listening story is taking shape one song at a time.'}
                  </p>
                  <AudioLines size={20} />
                </div>
              </Card>
            </section>
          </>
        )}
      </main>
      {(songDetailLoading || songDetailError || songDetail) && (
        <SongDetailModal
          detail={songDetail}
          loading={songDetailLoading}
          error={songDetailError}
          onClose={() => {
            setSongDetail(null)
            setSongDetailError('')
          }}
          onFavorite={toggleSongFavorite}
          favoriteSaving={favoriteSaving}
          onRefresh={() => songDetail && refreshSongDetail(songDetailRequestedId.current)}
        />
      )}
      {(artistDetailLoading || artistDetailError || artistDetail) && (
        <ArtistDetailModal
          detail={artistDetail}
          loading={artistDetailLoading}
          error={artistDetailError}
          onClose={() => {
            setArtistDetail(null)
            setArtistDetailError('')
          }}
          media={media}
          onOpenJellyfin={() => artistDetail && openJellyfinItem(artistDetail.item.jellyfinUrl)}
          onSongClick={openArtistSongInJellyfin}
        />
      )}
      {(albumDetailLoading || albumDetailError || albumDetail) && (
        <AlbumDetailModal
          detail={albumDetail}
          loading={albumDetailLoading}
          error={albumDetailError}
          onClose={() => {
            setAlbumDetail(null)
            setAlbumDetailError('')
          }}
          media={media}
          onOpenJellyfin={() => albumDetail && openJellyfinItem(albumDetail.item.jellyfinUrl)}
          onSongClick={openArtistSongInJellyfin}
        />
      )}
    </div>
  )
}

export default App
