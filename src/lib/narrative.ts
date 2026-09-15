import type { Dashboard } from '../types'
import { formatNumber, formatMinutes, formatHours, formatMonthName } from './format'

export function yearMonthName(ts: number) {
  return formatMonthName(ts)
}

export function getHeroCopy(year: number, hasListeningData: boolean, trackingStartedAt: number) {
  if (!hasListeningData) return `Your ${year} music journey is just getting started.`
  const started = new Date(trackingStartedAt)
  const now = new Date()
  if (
    started.getFullYear() === year &&
    started.getMonth() === now.getMonth() &&
    year === now.getFullYear()
  ) {
    return `Your ${year} music journey started in ${yearMonthName(trackingStartedAt)}. Let's see where it takes you.`
  }
  if (
    year === now.getFullYear() &&
    started.getFullYear() === year &&
    started.getMonth() > 0 &&
    started.getMonth() >= now.getMonth() - 3
  ) {
    return `Your ${year} music journey started in ${yearMonthName(trackingStartedAt)}. It's already starting to take shape.`
  }
  const month = now.getMonth()
  const copy: Record<string, string> = {
    early: `Your ${year} music journey is starting to take shape. Here's what's been becoming part of it.`,
    takingShape: `Your ${year} music journey is finding its shape, one listen at a time.`,
    midyear: `Halfway through ${year}, your music journey is starting to tell a story.`,
    established: `Your ${year} music journey has found its rhythm. Here's what's stayed with you.`,
    wrappingUp: `Most of ${year} is behind you. Here's the music that has stayed with you.`,
    complete: `Your ${year} music journey, told through the music you kept coming back to.`,
  }
  const stage =
    year < now.getFullYear()
      ? 'complete'
      : month <= 1
        ? 'early'
        : month <= 4
          ? 'takingShape'
          : month <= 6
            ? 'midyear'
            : month <= 8
              ? 'established'
              : month <= 10
                ? 'wrappingUp'
                : 'complete'
  return copy[stage]
}

export function getTopTracksNarrative(year: number, trackingStartedAt: number, plays: number) {
  if (!plays) return "No song has earned repeat plays yet — that's the fun part still ahead."
  const now = new Date()
  const started = new Date(trackingStartedAt)
  if (
    year === now.getFullYear() &&
    started.getFullYear() === year &&
    started.getMonth() === now.getMonth()
  )
    return `It's only ${yearMonthName(trackingStartedAt)}, but a few songs are already getting repeat treatment.`
  if (
    year === now.getFullYear() &&
    started.getFullYear() === year &&
    started.getMonth() > 0 &&
    started.getMonth() > now.getMonth() - 3
  )
    return `Since ${yearMonthName(trackingStartedAt)}, these are the songs you've kept finding your way back to.`
  if (year < now.getFullYear())
    return `These ten songs stood above the rest of your listening in ${year}.`
  const month = now.getMonth()
  if (month <= 2) return `Your early favorites are starting to emerge from your ${year} listening.`
  if (month <= 5) return `These are the songs that are starting to make ${year} feel like yours.`
  if (month <= 7)
    return `These are the songs you've kept coming back to through the first part of ${year}.`
  if (month <= 9)
    return `Some songs came and went. These ones have stayed with you through ${year}.`
  if (month <= 10)
    return `These songs have been at the heart of your listening through most of ${year}.`
  return `These ten songs stood above the rest of your listening in ${year}.`
}

export function getTopArtistsNarrative(year: number, trackingStartedAt: number, plays: number) {
  if (!plays) return "No artist has claimed your year yet — that's still up for grabs."
  const now = new Date()
  const started = new Date(trackingStartedAt)
  if (
    year === now.getFullYear() &&
    started.getFullYear() === year &&
    started.getMonth() === now.getMonth()
  )
    return `A few artists are already becoming part of your ${year} music journey.`
  if (
    year === now.getFullYear() &&
    started.getFullYear() === year &&
    started.getMonth() > 0 &&
    started.getMonth() > now.getMonth() - 3
  )
    return `Since ${yearMonthName(trackingStartedAt)}, these artists have been at the heart of your listening.`
  if (year < now.getFullYear())
    return `Five artists stood above the rest of your listening in ${year}.`
  const month = now.getMonth()
  if (month <= 2) return `A few artists are already starting to shape your ${year}.`
  if (month <= 5) return `These artists are becoming a bigger part of your ${year} music journey.`
  if (month <= 7) return `These artists have shaped much of your listening so far in ${year}.`
  if (month <= 9) return `These artists have stayed with you through ${year}.`
  if (month <= 10)
    return `These artists have been at the heart of your listening through most of ${year}.`
  return `Five artists stood above the rest of your listening in ${year}.`
}

export function buildCapsuleInsights(data: Dashboard | null) {
  if (!data?.totals?.plays)
    return [
      'Your listening story is just getting started. The next song could become part of your 2026.',
    ]
  const t = data.totals
  const d = data.derived
  const topSong = data.topSongs?.[0]
  const topArtist = data.topArtists?.[0]
  const topAlbum = data.topAlbums?.[0]
  const topGenre = data.topGenres?.[0]
  const year = data.year
  const minutes = Math.round((t.listened_ms || 0) / 60000)
  const repeatRate = Math.round((d.repeat_rate || 0) * 100)
  const candidates: string[] = []

  // Prefer concrete, personal observations over dashboard-like metric dumps.
  if (topSong?.track_title && Number(topSong.plays || 0) >= 3) {
    candidates.push(
      `You found a song worth coming back to. ${topSong.track_title} made it into your rotation ${formatNumber(topSong.plays)} times in ${year}.`,
    )
  }
  if (topArtist?.artist_name && Number(topArtist.plays || 0) >= 3) {
    candidates.push(
      `${topArtist.artist_name} found a place in your ${year}. You kept coming back ${formatNumber(topArtist.plays)} times.`,
    )
  }
  if (topAlbum?.album_name && Number(topAlbum.plays || 0) >= 3) {
    candidates.push(
      `${topAlbum.album_name} became part of your ${year} soundtrack, with ${formatNumber(topAlbum.plays)} plays.`,
    )
  }
  if (t.unique_tracks > 0 && t.unique_artists > 1) {
    candidates.push(
      `You explored ${formatNumber(t.unique_tracks)} songs from ${formatNumber(t.unique_artists)} artists in ${year}. Your soundtrack had plenty of room to wander.`,
    )
  }
  if (repeatRate >= 15) {
    candidates.push(
      `You explored new music, but you knew what to return to. Familiar songs made up ${repeatRate}% of your listening in ${year}.`,
    )
  } else if (repeatRate <= 10 && t.unique_tracks >= 10) {
    candidates.push(
      `You kept things moving. Most of your listening in ${year} came from songs you had not played before.`,
    )
  }
  if (d.listening_days >= 20) {
    candidates.push(
      `Music kept finding its way into your days. You listened on ${formatNumber(d.listening_days)} different days in ${year}.`,
    )
  }
  if (d.longest_streak >= 3) {
    candidates.push(
      `You had a stretch where the music just kept going — ${formatNumber(d.longest_streak)} days in a row in ${year}.`,
    )
  }
  if (d.longest_session_ms >= 45 * 60 * 1000) {
    candidates.push(
      `Some listens turned into proper sessions. Your longest one lasted ${formatMinutes(d.longest_session_ms)}.`,
    )
  }
  if (data.discoveredArtists >= 3) {
    candidates.push(
      `You met ${formatNumber(data.discoveredArtists)} artists for the first time in ${year}.`,
    )
  }
  if (topGenre?.genre) {
    candidates.push(
      `${topGenre.genre} kept pulling you back in ${year}. It became one of the defining sounds of your listening.`,
    )
  }
  if (minutes >= 60) {
    candidates.push(
      `You gave your music ${formatHours(t.listened_ms)} hours of your time in ${year}.`,
    )
  }
  if (!candidates.length) {
    candidates.push(
      `You listened your way through ${year}, one song at a time. This is the music that started making the year yours.`,
    )
  }

  // Rotate the narrative when the data changes so the same listener gets more than one story.
  const seed = (year + Number(t.plays || 0) + Number(t.unique_tracks || 0)) % candidates.length
  return candidates.slice(seed).concat(candidates.slice(0, seed))
}
export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}
// Rhythm archetype for the Activity hero. Deliberately built from *cadence* —
// how often you listen and in what sized chunks — rather than time of day, which
// the Dashboard's Listening Personality now owns. Keeping the two on separate
// axes stops the same listener being named twice for the same habit.
export function listeningRhythmArchetype(input: {
  avgSessionMs: number
  listeningDays: number
  elapsedDays: number
  peakDayName: string
  peakDaySharePct: number
}) {
  const often = input.elapsedDays > 0 && input.listeningDays / input.elapsedDays >= 0.5
  const long = input.avgSessionMs >= 45 * 60 * 1000
  const noun = often ? (long ? 'Deep Diver' : 'Everyday Listener') : long ? 'Marathoner' : 'Dipper'
  // A day carries a prefix only when it's clearly ahead of an even split (1/7
  // of the week). "Everyday" never takes one — it would contradict itself.
  const prefix =
    noun !== 'Everyday Listener' && input.peakDayName && input.peakDaySharePct >= 21
      ? `${input.peakDayName} `
      : ''
  return `The ${prefix}${noun}`
}
// Candidate sentences for the Dashboard's Top Artist card — the caller picks
// one at random. "Ahead of #2" only makes sense once a second artist exists
// with fewer plays, so it's included conditionally rather than always.
export function topArtistSentences(
  name: string,
  sharePct: number,
  completionPct: number,
  uniqueSongs: number,
  firstPlayedLabel: string,
  secondName?: string,
  lead?: number,
) {
  const options = [
    `${name} has been the soundtrack to ${sharePct}% of everything you played this year.`,
    `${completionPct}% of the time, you listen to ${name} all the way through — that's real loyalty.`,
    `Since ${firstPlayedLabel}, you've played ${uniqueSongs} different ${name} songs.`,
  ]
  if (secondName && lead && lead > 0)
    options.push(
      `${name} edged out ${secondName} by ${lead} plays to become your most-played artist.`,
    )
  return options
}
// ---------------------------------------------------------------------------
// Listening Personality
//
// The name is composed from three axes rather than read off one number:
//   noun      — repeat rate x genre diversity (a 4x2 grid, so 8 nouns)
//   adjective — the strongest *secondary* signal, whichever that turns out to be
//   band      — the time of day you peak, which also drives the card's artwork
// The adjective is deliberately conditional: a listener with no pronounced
// pattern gets a bare noun instead of a made-up trait.
// ---------------------------------------------------------------------------
export type PersonalityBand =
  'late-night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'

// Hour ranges are inclusive on both ends and cover all 24 hours exactly once.
export const PERSONALITY_BANDS: { band: PersonalityBand; from: number; to: number }[] = [
  { band: 'late-night', from: 0, to: 4 },
  { band: 'dawn', from: 5, to: 7 },
  { band: 'morning', from: 8, to: 10 },
  { band: 'midday', from: 11, to: 13 },
  { band: 'afternoon', from: 14, to: 16 },
  { band: 'evening', from: 17, to: 20 },
  { band: 'night', from: 21, to: 23 },
]
export function personalityBandOf(hour: number): PersonalityBand {
  const h = Math.max(0, Math.min(23, Math.round(hour)))
  return (PERSONALITY_BANDS.find(b => h >= b.from && h <= b.to) || PERSONALITY_BANDS[4]).band
}

const BAND_ADJECTIVE: Record<PersonalityBand, string> = {
  'late-night': 'Late-Night',
  dawn: 'Early-Morning',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}
const BAND_PHRASE: Record<PersonalityBand, string> = {
  'late-night': 'after midnight',
  dawn: 'around sunrise',
  morning: 'in the morning',
  midday: 'around the middle of the day',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'late at night',
}
// Repeat rate (rows) x whether taste is spread wide or sits tight (columns).
const PERSONALITY_NOUNS: [string, string][] = [
  ['The Seeker', 'The Wanderer'],
  ['The Drifter', 'The Roamer'],
  ['The Regular', 'The Collector'],
  ['The Loyalist', 'The Curator'],
]

export type PersonalityInput = {
  repeatRate: number
  diversityScore: number
  peakHour: number
  peakBandSharePct: number
  weekendSharePct: number
  longestStreak: number
  avgSessionMs: number
  longestSessionMs: number
  plays: number
  uniqueTracks: number
  uniqueArtists: number
  listeningDays: number
  discoveredArtists: number
  topArtistName: string
  topArtistPlays: number
  topArtistSharePct: number
  topGenre: string
  topGenreSharePct: number
  genreCount: number
  skipRatePct: number
  completionPct: number
}
export type Personality = { name: string; text: string; evidence: string[]; band: PersonalityBand }

function hourLabel(hour: number) {
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

export function listeningPersonality(input: PersonalityInput): Personality {
  const band = personalityBandOf(input.peakHour)
  const repeatPct = Math.round(input.repeatRate * 100)
  const row =
    input.repeatRate <= 0.25 ? 0 : input.repeatRate <= 0.4 ? 1 : input.repeatRate <= 0.6 ? 2 : 3
  const wide = input.diversityScore >= 50
  const noun = PERSONALITY_NOUNS[row][wide ? 1 : 0]

  // First match wins, so the name reflects the single most pronounced habit.
  // Falls through to a bare noun when nothing stands out enough to claim.
  const adjective =
    input.peakBandSharePct >= 30
      ? BAND_ADJECTIVE[band]
      : input.weekendSharePct >= 45
        ? 'Weekend'
        : input.weekendSharePct <= 20
          ? 'Weekday'
          : input.longestStreak >= 7
            ? 'Everyday'
            : input.avgSessionMs >= 45 * 60 * 1000
              ? 'Long-Haul'
              : ''
  const name = adjective ? noun.replace('The ', `The ${adjective} `) : noun

  const opening =
    row === 0
      ? `You rarely play the same thing twice — ${100 - repeatPct}% of your plays this year were songs you had not heard before.`
      : row === 1
        ? `You move between new music and old favourites, coming back to about ${repeatPct}% of what you play.`
        : row === 2
          ? `You have a core rotation. ${repeatPct}% of your plays are songs you had already heard this year.`
          : `You know exactly what you want — ${repeatPct}% of your plays are repeats.`
  const closing =
    adjective === BAND_ADJECTIVE[band]
      ? `Your listening clusters ${BAND_PHRASE[band]}, and ${hourLabel(input.peakHour)} is your busiest hour of the year.`
      : adjective === 'Weekend'
        ? `And ${input.weekendSharePct}% of it lands on a weekend.`
        : adjective === 'Weekday'
          ? `Almost all of it happens on weekdays — only ${input.weekendSharePct}% falls on a weekend.`
          : adjective === 'Everyday'
            ? `At your longest stretch you listened ${input.longestStreak} days in a row.`
            : adjective === 'Long-Haul'
              ? `When music goes on it stays on — your average sitting runs ${formatMinutes(input.avgSessionMs)}.`
              : wide
                ? `So far that is ${formatNumber(input.uniqueTracks)} songs from ${formatNumber(input.uniqueArtists)} artists.`
                : `You stay close to ${formatNumber(input.uniqueArtists)} artists rather than casting around.`

  // Same candidate-pool-and-rotate shape as buildCapsuleInsights: only lines the
  // data can actually support are offered, and the starting point moves as the
  // numbers move so the card does not read identically forever.
  const evidence: string[] = []
  if (input.topArtistName && input.topArtistPlays > 0) {
    evidence.push(
      input.uniqueArtists > 1
        ? `${input.topArtistName} is the one you keep coming back to — ${formatNumber(input.topArtistPlays)} plays, more than any other artist. Still only ${input.topArtistSharePct}% of your year; the rest went to ${formatNumber(input.uniqueArtists - 1)} others.`
        : `Everything you have played this year has been ${input.topArtistName}.`,
    )
  }
  if (input.peakBandSharePct >= 20) {
    evidence.push(
      `${hourLabel(input.peakHour)} is your busiest hour of the year, and ${input.peakBandSharePct}% of everything you play happens ${BAND_PHRASE[band]}.`,
    )
  }
  if (input.plays >= 20 && input.skipRatePct <= 20) {
    evidence.push(
      `You finish what you start. Only ${input.skipRatePct}% of your plays get skipped, and you average ${input.completionPct}% of a track.`,
    )
  }
  if (input.topGenre && input.genreCount > 1) {
    evidence.push(
      `${input.topGenre} is ${input.topGenreSharePct}% of what you play, but you have reached for ${formatNumber(input.genreCount)} genres in total.`,
    )
  }
  if (input.discoveredArtists >= 3) {
    evidence.push(
      `You have met ${formatNumber(input.discoveredArtists)} artists for the first time this year.`,
    )
  }
  if (input.longestStreak >= 3) {
    evidence.push(
      input.listeningDays > input.longestStreak
        ? `Your longest run was ${formatNumber(input.longestStreak)} days in a row, out of ${formatNumber(input.listeningDays)} days of listening.`
        : `You have listened ${formatNumber(input.longestStreak)} days in a row without missing one.`,
    )
  }
  if (input.longestSessionMs >= 30 * 60 * 1000) {
    evidence.push(`Your longest single sitting ran ${formatMinutes(input.longestSessionMs)}.`)
  }
  if (input.weekendSharePct > 0) {
    evidence.push(`${input.weekendSharePct}% of your listening happens on a Saturday or Sunday.`)
  }
  if (!evidence.length)
    evidence.push('This fills in with details from your own library as you keep listening.')
  const seed = (input.plays + input.uniqueTracks) % evidence.length

  // Capped at five so the dot row stays readable, and rotated so which five you
  // get moves with the data rather than always being the first five written.
  const rotated = evidence.slice(seed).concat(evidence.slice(0, seed))
  return { name, text: `${opening} ${closing}`, band, evidence: rotated.slice(0, 5) }
}
