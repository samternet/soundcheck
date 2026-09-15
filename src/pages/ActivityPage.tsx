import React, { useState, useEffect, useMemo } from 'react'
import {
  CalendarDays,
  Clock3,
  Flame,
  Gauge,
  Heart,
  Hourglass,
  Moon,
  Music2,
  PieChart,
  Zap,
  AudioLines,
} from 'lucide-react'
import type { Dashboard, Session, MediaInfo } from '../types'
import { formatNumber, formatMinutes, formatRelativeTime, formatDayMonth } from '../lib/format'
import { api, endpoints } from '../lib/api'
import { months, weekdayLabels, weekdayFullNames } from '../lib/constants'
import { listeningRhythmArchetype } from '../lib/narrative'
import { Card, CardHeader, Empty, MetricCard, Stat, Locked } from '../components/ui/primitives'
import { ActivityRadar } from '../components/charts/ActivityRadar'
import { HourlyPolarChart } from '../components/charts/HourlyPolarChart'
import { getUnlocks } from '../lib/unlock'
import { weekLockedCopy, heatmapLockedCopy, pickCopy } from '../lib/unlockCopy'

export function ActivityPage({
  data,
  media,
  session,
  onSongClick,
}: {
  data: Dashboard | null
  media: Record<string, MediaInfo>
  session: Session
  onSongClick: (itemId: string) => void
}) {
  const year = data?.year || new Date().getFullYear()
  const hourly = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) =>
        Number((data?.hourly || []).find((x: any) => Number(x.hour) === i)?.listened_ms || 0),
      ),
    [data],
  )
  const hourlyPlaysByHour = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) =>
        Number((data?.hourly || []).find((x: any) => Number(x.hour) === i)?.plays || 0),
      ),
    [data],
  )
  const peakHour = hourly.indexOf(Math.max(...hourly))
  const peakHourPlays = hourlyPlaysByHour[peakHour] || 0
  const peakHourLabel = `${peakHour % 12 === 0 ? 12 : peakHour % 12}:00 ${peakHour < 12 ? 'AM' : 'PM'}`
  const peakHourEnd = (peakHour + 1) % 24
  const peakHourEndLabel = `${peakHourEnd % 12 === 0 ? 12 : peakHourEnd % 12}:00 ${peakHourEnd < 12 ? 'AM' : 'PM'}`

  const weekday = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        Number((data?.weekday || []).find(x => x.dow === i)?.listened_ms || 0),
      ),
    [data],
  )
  const weekdayMax = Math.max(...weekday, 1)
  const weekdayRadar = weekday.map(v => Math.round((v / weekdayMax) * 100))
  const peakDay = weekday.indexOf(Math.max(...weekday))

  const hasListeningData = Math.max(...hourly) > 0
  const totalWeekMs = weekday.reduce((a, b) => a + b, 0)
  const weekendSharePct =
    totalWeekMs > 0 ? Math.round(((weekday[5] + weekday[6]) / totalWeekMs) * 100) : 0
  const biggestDay = useMemo(
    () =>
      (data?.dailyCalendar || []).reduce(
        (max: any, d: any) =>
          Number(d.listened_ms || 0) > Number(max?.listened_ms || 0) ? d : max,
        null as any,
      ),
    [data],
  )
  const biggestDayLabel = biggestDay
    ? formatDayMonth(new Date(`${biggestDay.date}T00:00:00`))
    : 'Biggest single day'
  // The hero names your cadence, not your clock — the Dashboard's Listening
  // Personality already owns time of day, and the Peak hour stat sits just below.
  const listeningDays = Number(data?.derived?.listening_days || 0)
  const longestStreak = Number(data?.derived?.longest_streak || 0)
  const avgSessionMs = Number(data?.derived?.avg_session_ms || 0)
  const unlocks = useMemo(
    () => getUnlocks(data?.trackingStartedAt, data?.unlockOverride),
    [data?.trackingStartedAt, data?.unlockOverride],
  )
  const heroName = listeningRhythmArchetype({
    avgSessionMs,
    listeningDays,
    elapsedDays: unlocks.elapsedDays,
    peakDayName: weekdayFullNames[peakDay],
    peakDaySharePct: totalWeekMs > 0 ? Math.round((weekday[peakDay] / totalWeekMs) * 100) : 0,
  })
  const heroSentence = useMemo(() => {
    const day = weekdayFullNames[peakDay]
    const options = [
      `You show up on ${day}s more than any other day, and you have listened on ${formatNumber(listeningDays)} days so far this year.`,
      `${day} is where your week peaks. Your longest run was ${formatNumber(longestStreak)} days in a row.`,
      `When you put music on it runs about ${formatMinutes(avgSessionMs)}, and ${day} carries more of it than any other day.`,
      `${weekendSharePct}% of your listening lands on the weekend, with ${day} doing the heaviest lifting.`,
    ]
    return options[Math.floor(Math.random() * options.length)]
  }, [peakDay, weekendSharePct, listeningDays, longestStreak, avgSessionMs])

  const calendarDays = useMemo(() => {
    const map = new Map((data?.dailyCalendar || []).map(d => [d.date, d.listened_ms]))
    // Always render the full Jan-Dec grid, including days after today, so the
    // filled-vs-empty ratio itself shows how far through the year the listener is.
    const start = new Date(year, 0, 1)
    const end = new Date(year, 11, 31)
    const days: { date: string; value: number }[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({ date: key, value: Number(map.get(key) || 0) })
    }
    const leadingBlanks = (start.getDay() + 6) % 7
    const totalCols = Math.max(1, Math.ceil((leadingBlanks + days.length) / 7))
    return { days, leadingBlanks, totalCols }
  }, [data?.dailyCalendar, year])
  const calendarMax = Math.max(...calendarDays.days.map(d => d.value), 1)
  const calendarBucket = (v: number) => {
    if (!v) return 0
    const r = v / calendarMax
    return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
  }
  const calendarColors = [
    'var(--cal-0)',
    'var(--cal-1)',
    'var(--cal-2)',
    'var(--cal-3)',
    'var(--cal-4)',
  ]
  const calendarMonthCols = useMemo(() => {
    const { days, leadingBlanks, totalCols } = calendarDays
    const colMonth: (number | null)[] = Array(totalCols).fill(null)
    days.forEach((d, j) => {
      const cellIndex = leadingBlanks + j
      const col = Math.floor(cellIndex / 7)
      const row = cellIndex % 7
      if (row === 0 && colMonth[col] === null) colMonth[col] = Number(d.date.slice(5, 7)) - 1
    })
    let lastMonth = -1
    return colMonth.map(m => {
      if (m === null || m === lastMonth) return null
      lastMonth = m
      return months[m]
    })
  }, [calendarDays])

  const weekLockedMessage = useMemo(
    () => pickCopy(weekLockedCopy(unlocks.daysUntil.week)),
    [unlocks.daysUntil.week],
  )
  const heatmapLockedMessage = useMemo(
    () => pickCopy(heatmapLockedCopy(unlocks.daysUntil.heatmap)),
    [unlocks.daysUntil.heatmap],
  )
  const derived = data?.derived
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [favoriteSavingId, setFavoriteSavingId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const ids = (data?.recentSongs || []).map(s => s.item_id).filter(Boolean)
    if (!ids.length) return
    ;(async () => {
      const entries = await Promise.all(
        ids.map(async id => {
          try {
            const detail = await api.get<{ favorite: boolean }>(endpoints.song(id, year), {
              sessionId: session.sessionId,
              noStore: true,
            })
            return [id, Boolean(detail.favorite)] as const
          } catch {
            return [id, false] as const
          }
        }),
      )
      if (cancelled) return
      setFavorites(prev => {
        const next = { ...prev }
        for (const [id, fav] of entries) next[id] = fav
        return next
      })
    })()
    return () => {
      cancelled = true
    }
    // Re-requests favourite state from Jellyfin every time the dashboard data refreshes
    // (including the 30s background poll), not just on first mount, so a favourite
    // toggled elsewhere (e.g. directly in Jellyfin) shows up here without a page reload.
  }, [data, year, session.sessionId])
  async function toggleFavorite(itemId: string) {
    if (favoriteSavingId) return
    setFavoriteSavingId(itemId)
    try {
      const current = Boolean(favorites[itemId])
      const updated = await api.post<{ favorite: boolean }>(
        endpoints.songFavorite(itemId),
        { favorite: !current },
        { sessionId: session.sessionId },
      )
      setFavorites(prev => ({ ...prev, [itemId]: Boolean(updated.favorite) }))
    } catch {
      /* the heart stays as it was; Jellyfin is the source of truth */
    } finally {
      setFavoriteSavingId(null)
    }
  }

  return (
    <div className="activity-page">
      <div className="page-intro genre-page-intro">
        <span className="eyebrow">
          <Clock3 size={14} /> YOUR LISTENING, OVER TIME
        </span>
        <h1>
          {hasListeningData
            ? 'When you actually listen.'
            : "We don't know your rhythm yet. Give it a week."}
        </h1>
        <p>
          {hasListeningData
            ? 'Your daily rhythm, your week, and your year — all in one place.'
            : 'Play a few songs, and your rhythm starts showing up here.'}
        </p>
      </div>

      {hasListeningData && (
        <section className="hero activity-hero">
          {unlocks.week ? (
            <>
              <div className="hero-copy">
                <div className="eyebrow">♪ YOUR LISTENING PATTERN</div>
                <h1>{heroName}</h1>
                <p>{heroSentence}</p>
              </div>
              <div className="hero-stats">
                <Stat
                  icon={<Moon size={18} />}
                  value={peakHourLabel}
                  sub={`until ${peakHourEndLabel}`}
                  label="Peak hour"
                />
                <Stat
                  icon={<CalendarDays size={18} />}
                  value={weekdayFullNames[peakDay]}
                  label="Heaviest day"
                />
                <Stat
                  icon={<PieChart size={18} />}
                  value={`${weekendSharePct}%`}
                  label="Weekend share"
                />
                <Stat
                  icon={<AudioLines size={18} />}
                  value={biggestDay ? formatMinutes(biggestDay.listened_ms) : '—'}
                  label={biggestDayLabel}
                />
              </div>
            </>
          ) : (
            <div className="hero-copy activity-hero-locked">
              <div className="eyebrow">♪ YOUR LISTENING PATTERN</div>
              <h1>Your pattern is still forming.</h1>
              <p>{weekLockedMessage}</p>
            </div>
          )}
        </section>
      )}

      <section className="genre-grid activity-primary-grid">
        <Card className="activity-radar-card">
          <CardHeader title="Your Listening Clock" />
          <p className="genre-section-subtitle">When during the day you tend to listen.</p>
          <HourlyPolarChart values={hourly} color="#e2916a" />
          {Math.max(...hourly) > 0 && (
            <div className="activity-clock-stats">
              <div>
                <span>Busiest hour</span>
                <strong>{peakHourLabel}</strong>
              </div>
              <div>
                <span>Plays in busiest hour</span>
                <strong>{formatNumber(peakHourPlays)} plays</strong>
              </div>
            </div>
          )}
        </Card>
        <Card className="activity-radar-card">
          <CardHeader title="Your Week" />
          <p className="genre-section-subtitle">Which days you return to music most.</p>
          {unlocks.week ? (
            <>
              <ActivityRadar values={weekdayRadar} labels={weekdayLabels} color="#8fa87c" />
              {weekdayMax > 1 && (
                <div className="activity-radar-note">
                  <strong>{weekdayFullNames[peakDay]}</strong> is your heaviest day.
                </div>
              )}
            </>
          ) : (
            <Locked message={weekLockedMessage} elapsedDays={unlocks.elapsedDays} threshold={7} />
          )}
        </Card>
      </section>

      <Card className="activity-calendar-card">
        <CardHeader title="Your Year at a Glance" />
        <p className="genre-section-subtitle">
          Every day you listened, from your first play to today.
        </p>
        {unlocks.heatmap ? (
          <>
            <div
              className="activity-calendar-scroll"
              style={{ '--cal-cols': calendarDays.totalCols } as React.CSSProperties}
            >
              <div className="activity-calendar-months">
                {calendarMonthCols.map((lab, i) => (
                  <span key={i} className="activity-calendar-month-col">
                    {lab && <em>{lab}</em>}
                  </span>
                ))}
              </div>
              <div className="activity-calendar-grid">
                {Array.from({ length: calendarDays.leadingBlanks }, (_, i) => (
                  <span key={`b${i}`} className="activity-calendar-cell blank" />
                ))}
                {calendarDays.days.map(d => (
                  <span
                    key={d.date}
                    className="activity-calendar-cell"
                    style={{ background: calendarColors[calendarBucket(d.value)] }}
                    title={`${d.date}: ${formatMinutes(d.value)}`}
                  />
                ))}
              </div>
            </div>
            <div className="activity-calendar-legend">
              <span>Less</span>
              {calendarColors.map((c, i) => (
                <span key={i} className="activity-calendar-swatch" style={{ background: c }} />
              ))}
              <span>More</span>
            </div>
          </>
        ) : (
          <Locked message={heatmapLockedMessage} elapsedDays={unlocks.elapsedDays} threshold={15} />
        )}
      </Card>

      <section className="stats-grid activity-stats-grid">
        <MetricCard
          icon={<Flame size={20} />}
          title="Longest Streak"
          value={`${formatNumber(derived?.longest_streak || 0)} days`}
          change="Consecutive listening days"
          tone="mint"
        />
        <MetricCard
          icon={<Zap size={20} />}
          title="Current Streak"
          value={`${formatNumber(data?.currentStreak || 0)} days`}
          change="Still going, if any"
          tone="peach"
        />
        <MetricCard
          icon={<Gauge size={20} />}
          title="Average Session"
          value={formatMinutes(derived?.avg_session_ms || 0)}
          change="Typical listen in one sitting"
          tone="yellow"
        />
        <MetricCard
          icon={<Hourglass size={20} />}
          title="Longest Session"
          value={formatMinutes(derived?.longest_session_ms || 0)}
          change="Your longest single stretch"
          tone="blue"
        />
      </section>

      <Card className="activity-recent-card">
        <CardHeader title="Recently Played" />
        <p className="genre-section-subtitle">Your last 10 plays.</p>
        {data?.recentSongs?.length ? (
          <div className="activity-recent-table">
            <div className="activity-recent-head">
              <span></span>
              <span>Song</span>
              <span className="activity-recent-col-album">Album</span>
              <span className="activity-recent-col-artist">Artist</span>
              <span className="activity-recent-col-when">Last played</span>
              <span className="activity-recent-col-completion align-center">Avg. Completion</span>
              <span className="activity-recent-col-rank align-center">Rank</span>
              <span className="activity-recent-col-plays align-right">Plays</span>
              <span className="activity-recent-col-mins align-right">Mins</span>
              <span className="activity-recent-col-fav"></span>
            </div>
            <div className="activity-recent-list">
              {data.recentSongs.map((song, i) => {
                const m = media[`item:${song.item_id}`]
                const artwork = m?.artwork || m?.albumArtwork
                const isFav = Boolean(favorites[song.item_id])
                const completionPct = Math.round((song.completion || 0) * 100)
                const completionTone =
                  completionPct >= 70 ? 'high' : completionPct >= 40 ? 'mid' : 'low'
                return (
                  <div
                    className="activity-recent-row"
                    key={song.item_id || i}
                    role="link"
                    tabIndex={0}
                    onClick={() => onSongClick(song.item_id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') onSongClick(song.item_id)
                    }}
                  >
                    <span className="activity-recent-rank">{i + 1}</span>
                    <div className="activity-recent-title">
                      <div className="activity-recent-cover">
                        {artwork ? <img src={artwork} alt="" /> : <Music2 size={14} />}
                      </div>
                      <strong>{song.track_title || 'Song'}</strong>
                    </div>
                    <span className="activity-recent-text activity-recent-col-album">
                      {song.album_name || '—'}
                    </span>
                    <span className="activity-recent-text activity-recent-col-artist">
                      {song.artist_name || '—'}
                    </span>
                    <span className="activity-recent-when activity-recent-col-when">
                      {formatRelativeTime(song.last_played)}
                    </span>
                    <span className="activity-recent-completion activity-recent-col-completion">
                      <span className={'activity-recent-badge ' + completionTone}>
                        {completionPct}%
                      </span>
                    </span>
                    <span
                      className={
                        'activity-recent-standing activity-recent-col-rank ' +
                        (song.overallRank && song.overallRank <= 10 ? 'top' : '')
                      }
                    >
                      {song.overallRank ? `#${song.overallRank}` : '—'}
                    </span>
                    <span className="activity-recent-num activity-recent-col-plays">
                      {formatNumber(song.plays)}
                    </span>
                    <span className="activity-recent-num activity-recent-col-mins">
                      {Math.round((song.listened_ms || 0) / 60000)}m
                    </span>
                    <button
                      className="activity-recent-fav activity-recent-col-fav"
                      aria-label={
                        isFav ? 'Remove from Jellyfin favourites' : 'Add to Jellyfin favourites'
                      }
                      aria-pressed={isFav}
                      disabled={favoriteSavingId === song.item_id}
                      onClick={e => {
                        e.stopPropagation()
                        toggleFavorite(song.item_id)
                      }}
                    >
                      <Heart size={15} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <Empty text="No plays yet. Start listening in Jellyfin and your recent activity will show up here." />
        )}
      </Card>
    </div>
  )
}
