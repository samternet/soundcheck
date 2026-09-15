import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Music2,
  Play,
  Users,
  AudioLines,
} from 'lucide-react'
import type { Dashboard, Session, MediaInfo } from '../types'
import { formatNumber, formatMinutes, formatWeekdayShort } from '../lib/format'
import { hourLabels, hourRanges, hourAxisLabels, genrePalette } from '../lib/constants'
import { genreArtPath, genreBucketValues, soundProfilePoints } from '../lib/genre-art'
import { Card, CardHeader, Locked } from '../components/ui/primitives'
import { GenreDetailModal } from '../components/modals/GenreDetailModal'
import { getUnlocks } from '../lib/unlock'
import {
  heatmapLockedCopy,
  weekLockedCopy,
  pickCopy,
  takeEasterEggIfUnseen,
} from '../lib/unlockCopy'

// Genre colours are flat hex, but the day tiles need them as a wash over whichever
// card surface is behind them — rgba composites correctly on both themes.
function genreTint(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

export function GenresPage({
  data,
  media,
  session,
}: {
  data: Dashboard | null
  media?: Record<string, MediaInfo>
  session?: Session
}) {
  const genres = (data?.genreStats || []).slice(0, 15)
  const topFive = genres.slice(0, 5)
  const nextTen = genres.slice(5, 15)
  const totalAttributed = Math.max(
    Number(data?.genreAttributedPlays || 0),
    genres.reduce((sum, g) => sum + Number(g.plays || 0), 0),
    1,
  )
  const topGenre = topFive[0]
  const topShare = topGenre ? Math.round((Number(topGenre.plays || 0) / totalAttributed) * 100) : 0
  const secondGenre = topFive[1]
  const secondShare = secondGenre
    ? Math.round((Number(secondGenre.plays || 0) / totalAttributed) * 100)
    : 0
  const avgPlaysPerGenre = data?.genreCount ? Math.round(totalAttributed / data.genreCount) : 0
  const diversity = Number(data?.derived?.genre_diversity_score || 0)
  const diversityLabel =
    diversity >= 80
      ? 'Eclectic'
      : diversity >= 60
        ? 'Wide-ranging'
        : diversity >= 35
          ? 'Balanced'
          : 'Focused'
  const diversityText =
    diversity >= 80
      ? 'You moved freely between very different sounds.'
      : diversity >= 60
        ? 'You explored widely while still keeping a few sounds close.'
        : diversity >= 35
          ? 'You kept a familiar core, but still made room for other sounds.'
          : 'A small group of sounds shaped most of your listening.'
  const topGenreHours = useMemo(() => {
    const buckets = genreBucketValues(topGenre?.hourly)
    const total = Math.max(
      buckets.reduce((a, b) => a + b, 0),
      1,
    )
    const peakIndex = buckets.reduce((best, v, i) => (v > buckets[best] ? i : best), 0)
    return {
      range: hourRanges[peakIndex],
      pct: Math.round((buckets[peakIndex] / total) * 100),
      label: hourLabels[peakIndex],
    }
  }, [topGenre])
  const heroText = topGenre?.genre
    ? topShare >= 28
      ? `${topGenre.genre} led your year.`
      : diversity >= 65
        ? `You didn't stay in one lane.`
        : `${topGenre.genre} found its way to the top.`
    : 'Your sounds are still taking shape.'
  const heroSub = topGenre?.genre
    ? `${topShare}% of your listening came from ${topGenre.genre}, with ${formatNumber(Math.round(Number(topGenre.plays || 0)))} attributed plays across ${formatNumber(topGenre.unique_artists || 0)} artists.`
    : 'Keep listening and Sound Capsule will start finding the sounds that define your year.'
  const discovery =
    topGenre && Number(data?.totals?.unique_artists || 0) > 0
      ? Math.min(
          100,
          Math.round(
            (Number(data?.discoveredArtists || 0) /
              Math.max(Number(data?.totals?.unique_artists || 0), 1)) *
              100,
          ),
        )
      : 0
  const consistency = useMemo(() => {
    const first = Number(data?.firstListeningAt || 0)
    if (!first) return 0
    const end = Math.min(
      Date.now(),
      new Date(`${data?.year || new Date().getFullYear()}-12-31T23:59:59`).getTime(),
    )
    const elapsedDays = Math.max(1, Math.floor((end - first) / 86400000) + 1)
    return Math.min(
      100,
      Math.round((Number(data?.derived?.listening_days || 0) / elapsedDays) * 100),
    )
  }, [data?.firstListeningAt, data?.derived?.listening_days, data?.year])
  const soundProfile = [
    discovery,
    Math.min(100, diversity),
    Math.min(100, Math.round((data?.derived?.repeat_rate || 0) * 100)),
    consistency,
  ]
  const chartOrder = [soundProfile[0], soundProfile[2], soundProfile[3], soundProfile[1]] // top(discovery), right(repeat), bottom(consistency), left(variety)
  const visibleGenres = nextTen.length
  const [selectedGenre, setSelectedGenre] = useState<(typeof topFive)[number] | null>(null)
  const genreStageRef = useRef<HTMLDivElement | null>(null)
  const [genreScrollProgress, setGenreScrollProgress] = useState(0)
  // Only the actual card row can know whether all 5 genres fit without scrolling —
  // show the scroll controls exactly when they don't, at any window width.
  const [genreScrollable, setGenreScrollable] = useState(false)
  useEffect(() => {
    const el = genreStageRef.current
    if (!el) return
    const update = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 1
      setGenreScrollable(scrollable)
      setGenreScrollProgress(scrollable ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [topFive.length])
  const moveGenres = (direction: number) => {
    genreStageRef.current?.scrollBy({
      left: direction * Math.max(200, (genreStageRef.current?.clientWidth || 480) * 0.62),
      behavior: 'smooth',
    })
  }
  const unlocks = useMemo(
    () => getUnlocks(data?.trackingStartedAt, data?.unlockOverride),
    [data?.trackingStartedAt, data?.unlockOverride],
  )
  const heatmapLockedMessage = useMemo(
    () => pickCopy(heatmapLockedCopy(unlocks.daysUntil.heatmap)),
    [unlocks.daysUntil.heatmap],
  )
  const weekLockedMessage = useMemo(
    () => pickCopy(weekLockedCopy(unlocks.daysUntil.week)),
    [unlocks.daysUntil.week],
  )
  const [easterEgg, setEasterEgg] = useState<string | null>(null)
  useEffect(() => {
    if (!unlocks.week) return
    const line = takeEasterEggIfUnseen()
    if (line) setEasterEgg(line)
  }, [unlocks.week])
  const timeline = useMemo(() => {
    if (!topFive.length || !unlocks.week) return null
    const dayCount = 7
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const windowStart = todayStart - (dayCount - 1) * 86400000
    const parseLocalDate = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m || 1) - 1, d || 1).getTime()
    }
    const buckets = Array.from({ length: dayCount }, () => new Map<string, number>())
    for (const g of topFive)
      for (const d of g.daily || []) {
        const idx = Math.floor((parseLocalDate(d.date) - windowStart) / 86400000)
        if (idx < 0 || idx >= dayCount) continue
        buckets[idx].set(g.genre, (buckets[idx].get(g.genre) || 0) + Number(d.listened_ms || 0))
      }
    const colorOf = (genre: string) =>
      genrePalette[
        Math.max(
          0,
          topFive.findIndex(g => g.genre === genre),
        ) % genrePalette.length
      ]
    const days = buckets.map((bucket, i) => {
      const label = formatWeekdayShort(windowStart + i * 86400000)
      let winner = ''
      let best = 0
      for (const g of topFive) {
        const ms = bucket.get(g.genre) || 0
        if (ms > best) {
          best = ms
          winner = g.genre
        }
      }
      // A day with nothing played has no winner. The old rank chart still picked
      // one by tie-breaking alphabetically — harmless in a line, but this layout
      // would have stated it as fact ("Tuesday sounded like Pop" with zero plays).
      return best > 0
        ? { label, genre: winner, color: colorOf(winner), quiet: false }
        : { label, genre: null, color: null, quiet: true }
    })
    const played = days.filter(d => !d.quiet)
    const first = played[0]?.genre
    const last = played[played.length - 1]?.genre
    const note = !played.length
      ? 'Nothing played in the past 7 days — this fills in as you listen.'
      : topFive.length < 5
        ? `Only ${topFive.length} genre${topFive.length === 1 ? '' : 's'} in the past week — this grows as you keep listening.`
        : first === last
          ? `${last} has led every day you listened this week.`
          : `${first} led early in the week, but ${last} has taken over.`
    return { days, note }
  }, [topFive, unlocks.week])
  return (
    <div className="genre-page">
      <div className="page-intro genre-page-intro">
        <span className="eyebrow">
          <Compass size={14} /> YOUR SOUNDS, HIGHLIGHTED
        </span>
        <h1>
          {topFive.length > 0
            ? 'Different sounds. Same you.'
            : 'Your music journey is just getting started.'}
        </h1>
        <p>
          {topFive.length > 0
            ? `From familiar favorites to new corners of your library, these are the genres that shaped your ${data?.year || new Date().getFullYear()}.`
            : 'No genre has taken the lead yet — your sound is still forming.'}
        </p>
      </div>

      <section className="dark-hero">
        <div className="dark-hero-copy">
          <span className="dark-hero-kicker">YOUR SOUND, YOUR STORY</span>
          <h2>{heroText}</h2>
          <p>{heroSub}</p>
        </div>
        <div className="dark-hero-visual" aria-label="Top five genres">
          {topFive.length > 0 && (
            <div className="dark-hero-note">
              Music has many sides.
              <br />
              So do you.
            </div>
          )}
          <div className="dark-hero-stage" ref={genreStageRef}>
            {topFive.map((g, i) => {
              const pct = Math.round((Number(g.plays || 0) / totalAttributed) * 100)
              return (
                <article
                  className={'highlight-track ' + (i === 0 ? 'is-first' : '')}
                  key={g.genre}
                  onClick={() => setSelectedGenre(g)}
                >
                  <div className="highlight-cover">
                    <img
                      src={genreArtPath(g.genre)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={e => {
                        const img = e.currentTarget
                        if (img.dataset.fallback === '1') return
                        img.dataset.fallback = '1'
                        img.src = '/genre-art/default.webp'
                      }}
                    />
                  </div>
                  <div className="highlight-title">{g.genre}</div>
                  <div className="highlight-artist">{pct}% of your listening</div>
                  <div className="highlight-stats">
                    <span>
                      <Play size={12} fill="currentColor" />{' '}
                      {formatNumber(Math.round(Number(g.plays || 0)))} plays
                    </span>
                    <span>
                      <Clock3 size={12} /> {formatMinutes(g.listened_ms || 0)}
                    </span>
                  </div>
                  <div className="highlight-rank">#{i + 1}</div>
                </article>
              )
            })}
          </div>
          {genreScrollable && (
            <div className="dark-hero-scroll-controls">
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Previous genres"
                onClick={() => moveGenres(-1)}
              >
                <ChevronLeft size={13} />
              </button>
              <div
                className="top5-scroll-track"
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
                  const el = genreStageRef.current
                  if (el)
                    el.scrollTo({
                      left: ratio * (el.scrollWidth - el.clientWidth),
                      behavior: 'smooth',
                    })
                }}
              >
                <div
                  className="top5-scroll-thumb"
                  style={{ left: `${genreScrollProgress * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Next genres"
                onClick={() => moveGenres(1)}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="genre-grid genre-primary-grid">
        <Card className="genre-profile-card">
          <CardHeader title="Your Sound Profile" />
          <p className="genre-section-subtitle">Four sides of how you listened this year.</p>
          {unlocks.heatmap ? (
            <div className="genre-profile-body">
              <div className="genre-profile-chart">
                <svg
                  viewBox="-30 -24 300 232"
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label="Your sound profile"
                >
                  {[25, 50, 75, 100].map(level => (
                    <polygon
                      key={level}
                      points={soundProfilePoints([level, level, level, level])}
                      fill="none"
                      className="chart-grid"
                      strokeWidth="1"
                    />
                  ))}
                  <line x1="120" y1="28" x2="202" y2="92" className="chart-grid" strokeWidth="1" />
                  <line x1="202" y1="92" x2="120" y2="156" className="chart-grid" strokeWidth="1" />
                  <line x1="120" y1="156" x2="38" y2="92" className="chart-grid" strokeWidth="1" />
                  <line x1="38" y1="92" x2="120" y2="28" className="chart-grid" strokeWidth="1" />
                  <polygon
                    points={soundProfilePoints(chartOrder)}
                    fill="rgba(241,139,109,.22)"
                    stroke="#e98667"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  {chartOrder.map((value, i) => {
                    const angle = ((-90 + i * 90) * Math.PI) / 180
                    const r = Math.max(0, Math.min(100, value)) / 100
                    const x = 120 + Math.cos(angle) * 82 * r
                    const y = 92 + Math.sin(angle) * 64 * r
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="4"
                        className="chart-dot"
                        stroke="#e98667"
                        strokeWidth="2"
                      />
                    )
                  })}
                  <text x="120" y="-8" textAnchor="middle" className="genre-profile-label">
                    DISCOVERY
                  </text>
                  <text x="221" y="96" textAnchor="start" className="genre-profile-label">
                    REPEAT
                  </text>
                  <text x="120" y="190" textAnchor="middle" className="genre-profile-label">
                    CONSISTENCY
                  </text>
                  <text x="19" y="96" textAnchor="end" className="genre-profile-label">
                    VARIETY
                  </text>
                  <text x="120" y="6" textAnchor="middle" className="genre-profile-value">
                    {soundProfile[0]}%
                  </text>
                  <text x="214" y="82" textAnchor="start" className="genre-profile-value">
                    {soundProfile[2]}%
                  </text>
                  <text x="120" y="174" textAnchor="middle" className="genre-profile-value">
                    {soundProfile[3]}%
                  </text>
                  <text x="26" y="82" textAnchor="end" className="genre-profile-value">
                    {soundProfile[1]}%
                  </text>
                </svg>
              </div>
              <div className="genre-profile-copy">
                <strong>{diversityLabel}</strong>
                <p>
                  Your listening balanced discovery, variety, repeat habits and consistency into one
                  profile. Each side is a score out of 100.
                </p>
              </div>
            </div>
          ) : (
            <Locked
              message={heatmapLockedMessage}
              elapsedDays={unlocks.elapsedDays}
              threshold={15}
            />
          )}
        </Card>

        <Card className="genre-timeline-card">
          <CardHeader title="Genre Timeline" />
          <p className="genre-section-subtitle">What each of the past 7 days sounded like.</p>
          {!unlocks.week && (
            <Locked message={weekLockedMessage} elapsedDays={unlocks.elapsedDays} threshold={7} />
          )}
          {unlocks.week && !timeline && (
            <div className="genre-timeline-empty">
              Your genre story will appear here as you listen.
            </div>
          )}
          {timeline && (
            <>
              <div className="genre-days">
                {timeline.days.map((d, i) => (
                  <div
                    key={i}
                    className={'genre-day' + (d.quiet ? ' quiet' : '')}
                    style={
                      d.color
                        ? {
                            background: genreTint(d.color, 0.16),
                            borderColor: genreTint(d.color, 0.34),
                          }
                        : undefined
                    }
                  >
                    <small>{d.label}</small>
                    <i style={d.color ? { background: d.color } : undefined} />
                    <strong>{d.quiet ? 'Quiet' : d.genre}</strong>
                  </div>
                ))}
              </div>
              <div className="genre-timeline-note">{easterEgg || timeline.note}</div>
            </>
          )}
        </Card>
      </section>

      {nextTen.length > 0 && (
        <section className="genre-spotlight-wrap">
          <div className="section-heading-row">
            <div>
              <h2>Genre Spotlight</h2>
              <p>More sounds from your listening, beyond your top five.</p>
            </div>
            <span>{formatNumber(visibleGenres)} featured</span>
          </div>
          <div className="genre-spotlight-grid">
            {nextTen.map((g, i) => {
              const rank = i + 6
              const pct = Math.round((Number(g.plays || 0) / totalAttributed) * 100)
              const spotlightCaptions = [
                'A steady presence in your rotation.',
                'One of the sounds that rounded out your year.',
                'A different flavor in your mix.',
                'Part of the wider story of your listening.',
                'Another thread in your sound.',
              ]
              return (
                <React.Fragment key={g.genre}>
                  <Card
                    className="genre-spotlight-card clickable-card"
                    onClick={() => setSelectedGenre(g)}
                  >
                    <div className="genre-spotlight-image">
                      <img
                        src={genreArtPath(g.genre)}
                        alt=""
                        loading="lazy"
                        onError={e => {
                          const img = e.currentTarget
                          if (img.dataset.fallback === '1') return
                          img.dataset.fallback = '1'
                          img.src = '/genre-art/default.webp'
                        }}
                      />
                      <div className="genre-spotlight-overlay" />
                      <span className="genre-spotlight-rank">#{rank}</span>
                      <div>
                        <strong>{g.genre}</strong>
                        <b>{pct}%</b>
                      </div>
                    </div>
                    <div className="genre-spotlight-copy">
                      <p>{spotlightCaptions[i % spotlightCaptions.length]}</p>
                      <div className="genre-feature-item">
                        <small>Top artist</small>
                        <div className="genre-feature-media">
                          <span className="genre-feature-thumb">
                            {(() => {
                              const artwork =
                                media?.[`artist:${g.topArtist?.artist_name || ''}`]?.artwork
                              return artwork ? (
                                <img src={artwork} alt="" loading="lazy" decoding="async" />
                              ) : (
                                <Users size={16} />
                              )
                            })()}
                          </span>
                          <strong>{g.topArtist?.artist_name || '—'}</strong>
                        </div>
                      </div>
                      <div className="genre-feature-item">
                        <small>Top track</small>
                        <div className="genre-feature-media">
                          <span className="genre-feature-thumb">
                            {(() => {
                              const artwork = g.topTrack?.item_id
                                ? media?.[`item:${g.topTrack.item_id}`]?.artwork ||
                                  media?.[`item:${g.topTrack.item_id}`]?.albumArtwork
                                : null
                              return artwork ? (
                                <img src={artwork} alt="" loading="lazy" decoding="async" />
                              ) : (
                                <Music2 size={16} />
                              )
                            })()}
                          </span>
                          <strong>{g.topTrack?.track_title || '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </Card>
                </React.Fragment>
              )
            })}
          </div>
        </section>
      )}

      <section className="genre-grid genre-secondary-grid">
        <Card className="genre-diversity-card">
          <CardHeader title="Your Genre Diversity" />
          <p className="genre-section-subtitle">
            How widely your listening moved across different sounds.
          </p>
          {unlocks.heatmap ? (
            <>
              <h3 className="genre-diversity-headline">{diversityLabel}</h3>
              <div className="genre-diversity-meter">
                <div
                  className="genre-diversity-meter-fill"
                  style={{ width: `${Math.max(3, Math.min(100, diversity))}%` }}
                />
                <div
                  className="genre-diversity-meter-marker"
                  style={{ left: `${Math.max(0, Math.min(100, diversity))}%` }}
                />
              </div>
              <div className="genre-diversity-meter-scale">
                <span>Focused</span>
                <span>Balanced</span>
                <span>Wide-ranging</span>
                <span>Eclectic</span>
              </div>
              <p className="genre-diversity-text">{diversityText}</p>
              <div className="genre-diversity-stat">
                <strong>{formatNumber(avgPlaysPerGenre)}</strong>
                <span>avg. plays per genre</span>
              </div>
            </>
          ) : (
            <Locked
              message={heatmapLockedMessage}
              elapsedDays={unlocks.elapsedDays}
              threshold={15}
            />
          )}
        </Card>

        <Card className="genre-time-card">
          <CardHeader title="When You listened to each genre" />
          <p className="genre-section-subtitle">Your top genres by time of day.</p>
          {unlocks.heatmap ? (
            <>
              <div className="genre-time-list">
                {topFive.map((g, i) => {
                  const buckets = genreBucketValues(g.hourly)
                  const max = Math.max(...buckets, 1)
                  const peakIndex = buckets.indexOf(Math.max(...buckets))
                  return (
                    <div className="genre-time-row" key={g.genre}>
                      <span
                        className="genre-time-dot"
                        style={{ background: genrePalette[i % genrePalette.length] }}
                      />
                      <strong>{g.genre}</strong>
                      <div className="genre-heat-strip">
                        {buckets.map((v, b) => (
                          <i
                            key={b}
                            style={{
                              background: genrePalette[i % genrePalette.length],
                              opacity: v ? Math.max(0.16, v / max) : 0.07,
                            }}
                            className={b === peakIndex ? 'peak' : ''}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div className="genre-time-axis">
                  <span />
                  <span />
                  <div className="genre-time-axis-cells">
                    {hourAxisLabels.map(h => (
                      <b key={h}>{h}</b>
                    ))}
                  </div>
                </div>
              </div>
              {topGenre?.genre && (
                <div className="genre-time-callout">
                  <Clock3 size={15} />
                  <span>
                    <strong>{topGenre.genre}</strong> peaks around{' '}
                    {topGenreHours.range || 'your busiest listening hours'}.
                  </span>
                  <b>{topGenreHours.pct}%</b>
                </div>
              )}
            </>
          ) : (
            <Locked
              message={heatmapLockedMessage}
              elapsedDays={unlocks.elapsedDays}
              threshold={15}
            />
          )}
        </Card>

        <Card className="genre-insights-card">
          <CardHeader title="A few genre insights" />
          {unlocks.heatmap ? (
            <div className="genre-insights-list">
              {topGenre?.genre && (
                <div>
                  <span className="insight-icon sun">
                    <AudioLines size={17} />
                  </span>
                  <div>
                    <strong>{topGenre.genre} led the mix.</strong>
                    <small>
                      {secondGenre
                        ? `${Math.max(topShare - secondShare, 0)} points ahead of ${secondGenre.genre}.`
                        : 'Your clear favorite this year.'}
                    </small>
                  </div>
                </div>
              )}
              {topGenre?.topArtist?.artist_name && (
                <div>
                  <span className="insight-icon moon">
                    <Users size={17} />
                  </span>
                  <div>
                    <strong>
                      {topGenre.topArtist.artist_name} was your face of {topGenre.genre}.
                    </strong>
                    <small>Your most-played artist within the genre.</small>
                  </div>
                </div>
              )}
              {diversity > 0 && (
                <div>
                  <span className="insight-icon bars">
                    <ArrowDownUp size={17} />
                  </span>
                  <div>
                    <strong>Your taste was {diversityLabel.toLowerCase()}.</strong>
                    <small>
                      {Math.max((data?.genreCount || 0) - 5, 0)} more genres rounded out your year
                      beyond your top 5.
                    </small>
                  </div>
                </div>
              )}
              {topGenre?.genre && topGenreHours.range && (
                <div>
                  <span className="insight-icon clock">
                    <Clock3 size={17} />
                  </span>
                  <div>
                    <strong>
                      {topGenre.genre} leaned {topGenreHours.label.toLowerCase()}.
                    </strong>
                    <small>Based on the strongest listening window for the genre.</small>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Locked
              message={heatmapLockedMessage}
              elapsedDays={unlocks.elapsedDays}
              threshold={15}
            />
          )}
        </Card>
      </section>
      {selectedGenre && (
        <GenreDetailModal
          genre={selectedGenre}
          media={media}
          session={session}
          year={data?.year || new Date().getFullYear()}
          totalAttributed={totalAttributed}
          onClose={() => setSelectedGenre(null)}
        />
      )}
    </div>
  )
}
