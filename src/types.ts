export type Session = {
  sessionId: string
  user: { id: string; name: string; isAdministrator: boolean }
  jellyfinUrl: string
  serverName?: string
  serverVersion?: string
}
export type Dashboard = {
  year: number
  totals: {
    listened_ms: number
    plays: number
    unique_tracks: number
    unique_artists: number
    unique_albums: number
    avg_completion: number
    skips: number
  }
  derived: {
    repeat_plays: number
    repeat_rate: number
    listening_days: number
    longest_streak: number
    avg_session_ms: number
    longest_session_ms: number
    top_artist_share: number
    genre_diversity_score: number
  }
  topSongs: {
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    plays: number
    listened_ms: number
    track_duration_ms: number
    completion: number
    last_played: number
    overallRank: number | null
  }[]
  topArtists: {
    artist_name: string
    plays: number
    listened_ms: number
    avgCompletion: number
    uniqueSongs: number
    firstPlayed: number
    lastPlayed: number
    favoriteTrack: { item_id: string; title: string; plays: number; listened_ms: number } | null
  }[]
  topAlbums: {
    album_name: string
    artist_name: string
    plays: number
    listened_ms: number
    unique_songs: number
  }[]
  topGenres: { genre: string; count: number }[]
  monthlyTopSongs?: ({
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    plays: number
    listened_ms: number
  } | null)[]
  neverSkippedSongs?: {
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    plays: number
    completion: number
    skipRate: number
  }[]
  mostSkippedSongs?: {
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    plays: number
    completion: number
    skipRate: number
  }[]
  repeatStreaks?: {
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    day: string
    dayPlays: number
    avgCompletion: number
  }[]
  trendingSongs?: {
    item_id: string
    track_title: string
    artist_name: string
    album_name: string
    plays: number
    weekRank: number
    overallRank: number | null
  }[]
  genreStats?: {
    genre: string
    plays: number
    listened_ms: number
    unique_tracks: number
    unique_artists: number
    topTrack?: {
      item_id: string
      track_title: string
      artist_name: string
      plays: number
      listened_ms: number
    } | null
    topArtist?: { artist_name: string; plays: number; listened_ms: number } | null
    monthly: number[]
    hourly: number[]
    daily?: { date: string; listened_ms: number }[]
  }[]
  genreCount?: number
  genreAttributedPlays?: number
  monthly: any[]
  hourly: any[]
  devices: any[]
  discoveredArtists: number
  weekday?: { dow: number; plays: number; listened_ms: number }[]
  dailyCalendar?: { date: string; listened_ms: number }[]
  recentSongs?: {
    item_id: string
    track_title: string
    album_name: string
    artist_name: string
    plays: number
    listened_ms: number
    last_played: number
    completion: number
    overallRank: number | null
  }[]
  currentStreak?: number
  years: number[]
  trackingStartedAt: number
  firstListeningAt: number | null
  unlockOverride: boolean
}
export type Me = {
  user: { id: string; name: string; isAdministrator: boolean }
  jellyfinUrl: string
  jellyfinPublicUrl?: string | null
  jellyfinTailscaleUrl?: string | null
  serverName?: string
  serverTracking: boolean
  connectedAdmin?: string
  timezone?: string
  profileImage?: string | null
}
export type ArtistDetail = {
  item: {
    id: string
    name: string
    type: string
    rank?: number | null
    productionYear?: number | null
    artwork?: string | null
    jellyfinUrl: string
  }
  stats: {
    plays: number
    listened_ms: number
    skips: number
    completions: number
    avg_completion: number
    unique_songs: number
    first_played: number | null
    last_played: number | null
  }
  activity: { month: number; plays: number; listened_ms: number }[]
  topSongs: {
    item_id: string
    track_title: string
    album_name: string
    plays: number
    listened_ms: number
    track_duration_ms: number
  }[]
  year: number
}
export type AlbumDetail = {
  item: {
    id: string
    name: string
    type: string
    artistName: string
    rank?: number | null
    productionYear?: number | null
    artwork?: string | null
    jellyfinUrl: string
    trackCount: number
  }
  stats: {
    plays: number
    listened_ms: number
    unique_songs: number
    first_played: number | null
    last_played: number | null
  }
  activity: { month: number; plays: number; listened_ms: number }[]
  topSongs: {
    item_id: string
    track_title: string
    plays: number
    listened_ms: number
    track_duration_ms: number
    album_name: string
    artist_name: string
  }[]
  year: number
}
export type SongDetail = {
  item: {
    id: string
    name: string
    type: string
    durationMs: number
    artistName: string
    albumName: string
    albumId?: string
    artistId?: string
    genres: string[]
    artwork?: string | null
    albumArtwork?: string | null
    jellyfinUrl: string
  }
  stats: {
    plays: number
    listened_ms: number
    skips: number
    completions: number
    avg_completion: number
    first_played: number | null
    last_played: number | null
  }
  activity: { month: number; plays: number; listened_ms: number }[]
  favorite: boolean
  year: number
}

export type MediaInfo = {
  id: string
  name: string
  type: string
  albumId?: string
  artistId?: string
  artistName?: string
  albumName?: string
  artwork?: string | null
  albumArtwork?: string | null
  artistArtwork?: string | null
  favorite?: boolean
  trackCount?: number
  productionYear?: number | null
  jellyfinUrl: string
}
