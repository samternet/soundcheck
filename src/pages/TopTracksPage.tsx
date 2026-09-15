import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Minus,
  Play,
  Search,
  Zap,
  AudioLines,
} from 'lucide-react'
import type { Dashboard, MediaInfo } from '../types'
import {
  formatNumber,
  formatMinutes,
  formatRelativeTime,
  formatWeekdayDayMonth,
} from '../lib/format'
import { getTopTracksNarrative } from '../lib/narrative'
import { months } from '../lib/constants'
import { getUnlocks } from '../lib/unlock'
import { weekLockedCopy, pickCopy } from '../lib/unlockCopy'
import { Locked } from '../components/ui/primitives'

function formatStreakDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return formatWeekdayDayMonth(new Date(y, m - 1, d))
}

export function TopTracksPage({
  data,
  media,
  onSongClick,
  onToggleFavorite,
  favoritingIds,
  trackingStartedAt,
}: {
  data: Dashboard | null
  media: Record<string, MediaInfo>
  onSongClick: (itemId: string) => void
  onToggleFavorite: (itemId: string, current: boolean) => void
  favoritingIds: Set<string>
  trackingStartedAt: number
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'plays' | 'minutes'>('plays')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [scrollable, setScrollable] = useState(false)
  const topTenRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sortOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) setSortOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [sortOpen])
  const songs = (data?.topSongs || []).slice(0, 50)
  const topTen = songs.slice(0, 10)
  const rest = songs.slice(10)
  const topTenMs = topTen.reduce((sum, s) => sum + Number(s.listened_ms || 0), 0)
  const monthlyTop = data?.monthlyTopSongs || []
  const firstMonthWithData = monthlyTop.findIndex(m => m)
  const visibleMonths =
    firstMonthWithData === -1
      ? []
      : monthlyTop
          .slice(firstMonthWithData)
          .map((entry, i) => ({ monthIndex: firstMonthWithData + i, entry }))
  const bestMonthPlays = Math.max(0, ...monthlyTop.map(m => m?.plays || 0))
  const currentYear = new Date().getFullYear()
  const isCurrentYear = (data?.year || currentYear) === currentYear
  const unlocks = useMemo(
    () => getUnlocks(trackingStartedAt, data?.unlockOverride),
    [trackingStartedAt, data?.unlockOverride],
  )
  const weekLockedMessage = useMemo(
    () => pickCopy(weekLockedCopy(unlocks.daysUntil.week)),
    [unlocks.daysUntil.week],
  )
  const currentMonthIndex = new Date().getMonth()
  const neverSkipped = data?.neverSkippedSongs || []
  const mostSkipped = data?.mostSkippedSongs || []
  // Only songs whose Jellyfin favourite status has actually loaded are eligible —
  // treating "not yet known" as "not favourited" would flash every song here
  // for a moment on first load.
  const resolvedSongs = songs.filter(s => media[`item:${s.item_id}`])
  const unfavorited = resolvedSongs.filter(s => !media[`item:${s.item_id}`]?.favorite).slice(0, 5)
  const streaks = data?.repeatStreaks || []
  const topStreak = streaks[0]
  const otherStreaks = streaks.slice(1)
  const trending = data?.trendingSongs || []
  useEffect(() => {
    const el = topTenRef.current
    if (!el) return
    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 1
      setScrollable(canScroll)
      setScrollProgress(canScroll ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0)
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
  }, [topTen.length])
  const moveTopTen = (direction: number) => {
    topTenRef.current?.scrollBy({
      left: direction * Math.max(240, (topTenRef.current?.clientWidth || 500) * 0.62),
      behavior: 'smooth',
    })
  }
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (s: any) =>
      !q ||
      [s.track_title, s.artist_name, s.album_name].some(v =>
        String(v || '')
          .toLowerCase()
          .includes(q),
      )
    return [...rest]
      .filter(matches)
      .sort((a, b) =>
        sort === 'plays'
          ? Number(b.plays || 0) - Number(a.plays || 0) ||
            Number(b.listened_ms || 0) - Number(a.listened_ms || 0)
          : Number(b.listened_ms || 0) - Number(a.listened_ms || 0),
      )
  }, [rest, query, sort])

  return (
    <div className="top-tracks-page">
      <div className="top-tracks-heading">
        <div>
          <span className="top-tracks-eyebrow">
            <AudioLines size={13} /> YOUR MUSIC, HIGHLIGHTED
          </span>
          <h1>
            {topTen.length > 0
              ? 'The songs that have shaped your music journey.'
              : 'Your music journey is just getting started.'}
          </h1>
          <p>
            {getTopTracksNarrative(
              data?.year || new Date().getFullYear(),
              trackingStartedAt,
              Number(data?.totals?.plays || 0),
            )}
          </p>
        </div>
      </div>

      <section className="dark-hero">
        <div className="dark-hero-copy">
          <span className="dark-hero-kicker">♪ YOUR TOP 10 SONGS</span>
          <h2>{topTen.length > 0 ? 'On repeat.' : 'Nothing yet.'}</h2>
          <p>
            {topTenMs
              ? `Together, these songs kept you listening for ${formatMinutes(topTenMs)}.`
              : 'Your top 10 will appear here as you keep listening.'}
          </p>
        </div>
        <div className="dark-hero-visual" aria-label="Top ten songs">
          {topTen.length > 0 && (
            <div className="dark-hero-note">
              Some songs
              <br />
              never get old.
            </div>
          )}
          <div className="dark-hero-stage" ref={topTenRef}>
            {topTen.map((s, i) => {
              const m = media[`item:${s.item_id}`]
              const artwork = m?.artwork || m?.albumArtwork || undefined
              return (
                <article
                  className={'highlight-track ' + (i === 0 ? 'is-first' : '')}
                  key={s.item_id || i}
                  onClick={() => onSongClick(s.item_id)}
                >
                  <div className="highlight-cover">
                    {artwork ? (
                      <img src={artwork} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="capsule-art-fallback branded">
                        <span>
                          {i === 0 ? '♬' : i === 1 ? '◒' : i === 2 ? '♫' : i === 3 ? '◌' : '♪'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="highlight-title">{s.track_title || 'Song Name'}</div>
                  <div className="highlight-artist">{s.artist_name || 'Artist Name'}</div>
                  <div className="highlight-stats">
                    <span>
                      <Play size={12} fill="currentColor" /> {formatNumber(s.plays || 0)} plays
                    </span>
                    <span>
                      <Clock3 size={12} /> {formatMinutes(s.listened_ms || 0)}
                    </span>
                  </div>
                  <div className="highlight-rank">#{i + 1}</div>
                </article>
              )
            })}
          </div>
          {scrollable && (
            <div className="dark-hero-scroll-controls">
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Previous songs"
                onClick={() => moveTopTen(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <div
                className="top5-scroll-track"
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
                  const el = topTenRef.current
                  if (el)
                    el.scrollTo({
                      left: ratio * (el.scrollWidth - el.clientWidth),
                      behavior: 'smooth',
                    })
                }}
              >
                <div className="top5-scroll-thumb" style={{ left: `${scrollProgress * 100}%` }} />
              </div>
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Next songs"
                onClick={() => moveTopTen(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>

      {visibleMonths.length > 0 && (
        <section className="all-tracks-card monthly-anthem-card">
          <div className="all-tracks-head">
            <div>
              <h2>Your song of the month</h2>
              <p>{`The track that dominated each month of ${data?.year || currentYear}.`}</p>
            </div>
          </div>
          <div className="month-strip">
            {visibleMonths.map(({ monthIndex, entry }) => {
              const isCurrent = isCurrentYear && monthIndex === currentMonthIndex
              const isBest =
                Boolean(entry) &&
                entry!.plays === bestMonthPlays &&
                bestMonthPlays > 0 &&
                !isCurrent
              const m = entry ? media[`item:${entry.item_id}`] : undefined
              const artwork = m?.artwork || m?.albumArtwork || undefined
              return (
                <div
                  className={
                    'month-chip' + (isBest ? ' is-best' : '') + (!entry ? ' is-empty' : '')
                  }
                  key={monthIndex}
                  role={entry ? 'button' : undefined}
                  tabIndex={entry ? 0 : undefined}
                  onClick={() => {
                    if (entry) onSongClick(entry.item_id)
                  }}
                  onKeyDown={e => {
                    if (entry && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onSongClick(entry.item_id)
                    }
                  }}
                >
                  <div className="month-chip-cover">
                    {artwork ? (
                      <img src={artwork} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="capsule-art-fallback branded">
                        <span>♪</span>
                      </div>
                    )}
                  </div>
                  <small>
                    {months[monthIndex].toUpperCase()}
                    {isBest ? ' · BEST MONTH' : isCurrent ? ' · SO FAR' : ''}
                  </small>
                  <strong>{entry ? entry.track_title : '—'}</strong>
                  <em>{entry ? entry.artist_name || 'Unknown artist' : 'No plays yet'}</em>
                  {entry && (
                    <span className="month-chip-plays">{formatNumber(entry.plays)} plays</span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="tracks-module-row">
        {(neverSkipped.length > 0 || mostSkipped.length > 0) && (
          <section className="all-tracks-card">
            <div className="all-tracks-head">
              <div>
                <h2>Songs you finish vs. songs you skip</h2>
                <p>Completion and skip behaviour for the tracks you've played more than once.</p>
              </div>
            </div>
            <div className="behavior-split">
              <div className="behavior-col good">
                <div className="behavior-col-head">
                  <span className="behavior-ic">
                    <CheckCircle2 size={14} />
                  </span>
                  <b>Never skipped</b>
                </div>
                {neverSkipped.length > 0 ? (
                  neverSkipped.map(s => {
                    const m = media[`item:${s.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork || undefined
                    return (
                      <div
                        className="behavior-row"
                        key={s.item_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSongClick(s.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(s.item_id)
                        }}
                      >
                        <div className="behavior-cover">
                          {artwork ? (
                            <img src={artwork} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="capsule-art-fallback">
                              <span>♪</span>
                            </div>
                          )}
                        </div>
                        <div className="behavior-text">
                          <b>{s.track_title}</b>
                          <small>{s.artist_name || 'Artist Name'}</small>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="behavior-empty">
                    No repeated song has a perfect finish rate yet.
                  </div>
                )}
              </div>
              <div className="behavior-col bad">
                <div className="behavior-col-head">
                  <span className="behavior-ic">
                    <Zap size={14} />
                  </span>
                  <b>Almost always skipped</b>
                </div>
                {mostSkipped.length > 0 ? (
                  mostSkipped.map(s => {
                    const m = media[`item:${s.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork || undefined
                    return (
                      <div
                        className="behavior-row"
                        key={s.item_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSongClick(s.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(s.item_id)
                        }}
                      >
                        <div className="behavior-cover">
                          {artwork ? (
                            <img src={artwork} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="capsule-art-fallback">
                              <span>♪</span>
                            </div>
                          )}
                        </div>
                        <div className="behavior-text">
                          <b>{s.track_title}</b>
                          <small>{s.artist_name || 'Artist Name'}</small>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="behavior-empty">You haven't skipped a repeated song yet.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {unfavorited.length > 0 && (
          <section className="all-tracks-card">
            <div className="all-tracks-head">
              <div>
                <h2>These earned it</h2>
                <p>Top-played songs that aren't a Jellyfin favourite yet.</p>
              </div>
            </div>
            <div className="fav-nudge-list">
              {unfavorited.map(s => {
                const m = media[`item:${s.item_id}`]
                const artwork = m?.artwork || m?.albumArtwork || undefined
                const saving = favoritingIds.has(s.item_id)
                return (
                  <div
                    className="fav-nudge-row"
                    key={s.item_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSongClick(s.item_id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSongClick(s.item_id)
                      }
                    }}
                  >
                    <div className="fav-nudge-cover">
                      {artwork ? (
                        <img src={artwork} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <div className="capsule-art-fallback">
                          <span>♪</span>
                        </div>
                      )}
                    </div>
                    <div className="fav-nudge-text">
                      <b>{s.track_title}</b>
                      <small>{s.artist_name || 'Artist Name'}</small>
                    </div>
                    <span className="fav-nudge-stats">
                      {formatNumber(s.plays || 0)} plays · {formatMinutes(s.listened_ms || 0)}
                    </span>
                    <button
                      type="button"
                      className="fav-nudge-heart"
                      aria-label="Add to Jellyfin favourites"
                      disabled={saving}
                      onClick={e => {
                        e.stopPropagation()
                        onToggleFavorite(s.item_id, false)
                      }}
                    >
                      <Heart size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <div className="tracks-module-row">
        {(!unlocks.week || topStreak) && (
          <section className="all-tracks-card">
            <div className="all-tracks-head">
              <div>
                <h2>Songs you couldn't stop replaying</h2>
                <p>The most times you played one track on a single day.</p>
              </div>
            </div>
            {!unlocks.week ? (
              <Locked message={weekLockedMessage} elapsedDays={unlocks.elapsedDays} threshold={7} />
            ) : (
              <>
                {topStreak &&
                  (() => {
                    const m = media[`item:${topStreak.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork || undefined
                    return (
                      <div
                        className="streak-hero"
                        role="button"
                        tabIndex={0}
                        onClick={() => onSongClick(topStreak.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(topStreak.item_id)
                        }}
                      >
                        <div className="streak-hero-cover">
                          {artwork ? (
                            <img src={artwork} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="capsule-art-fallback">
                              <span>♪</span>
                            </div>
                          )}
                        </div>
                        <div className="streak-hero-num">{topStreak.dayPlays}×</div>
                        <div className="streak-hero-copy">
                          <small>BIGGEST SINGLE-DAY STREAK</small>
                          <b>
                            {topStreak.track_title} — played {topStreak.dayPlays} times
                          </b>
                          <span>
                            on {formatStreakDay(topStreak.day)} ·{' '}
                            {Math.round(topStreak.avgCompletion * 100)}% avg. listened
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                {otherStreaks.length > 0 && (
                  <div className="streak-list">
                    {otherStreaks.map(s => (
                      <div
                        className="streak-item"
                        key={s.item_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSongClick(s.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(s.item_id)
                        }}
                      >
                        <span className="streak-item-n">{s.dayPlays}×</span>
                        <div className="streak-item-text">
                          <b>{s.track_title}</b>
                          <small>
                            {s.artist_name || 'Artist Name'} · {formatStreakDay(s.day)} ·{' '}
                            {Math.round(s.avgCompletion * 100)}% avg. listened
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {isCurrentYear && (
          <section className="all-tracks-card">
            <div className="all-tracks-head">
              <div>
                <h2>What you've been on repeat this week</h2>
                <p>The songs stealing your attention lately.</p>
              </div>
            </div>
            {!unlocks.week ? (
              <Locked message={weekLockedMessage} elapsedDays={unlocks.elapsedDays} threshold={7} />
            ) : trending.length > 0 ? (
              <div className="week-list">
                {trending.map(s => {
                  const m = media[`item:${s.item_id}`]
                  const artwork = m?.artwork || m?.albumArtwork || undefined
                  const gap = s.overallRank !== null ? s.overallRank - s.weekRank : 0
                  return (
                    <div
                      className="week-row"
                      key={s.item_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSongClick(s.item_id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') onSongClick(s.item_id)
                      }}
                    >
                      <span
                        className={
                          'week-move ' +
                          (s.overallRank === null
                            ? 'move-new'
                            : gap > 0
                              ? 'move-up'
                              : gap < 0
                                ? 'move-down'
                                : 'move-flat')
                        }
                      >
                        {s.overallRank === null ? (
                          'NEW'
                        ) : gap > 0 ? (
                          <>
                            <ArrowUp size={11} /> {gap}
                          </>
                        ) : gap < 0 ? (
                          <>
                            <ArrowDown size={11} /> {Math.abs(gap)}
                          </>
                        ) : (
                          <Minus size={11} />
                        )}
                      </span>
                      <div className="week-cover">
                        {artwork ? (
                          <img src={artwork} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <div className="capsule-art-fallback">
                            <span>♪</span>
                          </div>
                        )}
                      </div>
                      <div className="week-text">
                        <b>{s.track_title}</b>
                        <small>{s.artist_name || 'Artist Name'}</small>
                      </div>
                      <span className="week-plays">
                        {formatNumber(s.plays)} {s.plays === 1 ? 'play' : 'plays'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="week-empty">
                No plays logged in the last 7 days — this list will pick back up once you start
                listening again.
              </div>
            )}
          </section>
        )}
      </div>

      <section className="all-tracks-card">
        <div className="all-tracks-head">
          <div>
            <h2>Songs 11–50</h2>
            <p>{`More songs that shaped your ${data?.year || currentYear}.`}</p>
          </div>
          <div className="track-tools">
            <label className="track-search">
              <Search size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search songs…"
              />
              <span>{query ? filtered.length : rest.length}</span>
            </label>
            <div className="custom-sort" ref={sortRef}>
              <button
                type="button"
                className="custom-sort-trigger"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen(v => !v)}
              >
                <ArrowDownUp size={14} />
                <span>{sort === 'plays' ? 'Most played' : 'Most minutes'}</span>
                <ChevronDown size={14} />
              </button>
              {sortOpen && (
                <div className="custom-sort-menu" role="listbox">
                  <div className="custom-sort-label">Sort by</div>
                  {(['plays', 'minutes'] as const).map(value => (
                    <button
                      type="button"
                      key={value}
                      className={'custom-sort-option ' + (sort === value ? 'active' : '')}
                      role="option"
                      aria-selected={sort === value}
                      onClick={() => {
                        setSort(value)
                        setSortOpen(false)
                      }}
                    >
                      {sort === value && <span className="custom-sort-check">✓</span>}{' '}
                      {value === 'plays' ? 'Most played' : 'Most minutes'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="tracks-table-head">
          <span>#</span>
          <span>Title</span>
          <span className="table-col-album">Album</span>
          <span className="table-col-artist">Artist</span>
          <span className="table-col-when">Last played</span>
          <span className="table-col-completion align-center">Avg. Completion</span>
          <span className="table-col-plays align-right">Plays</span>
          <span className="table-col-mins align-right">Minutes</span>
          <span className="table-col-fav"></span>
        </div>
        <div className="tracks-table">
          {filtered.map((s, index) => {
            const rank = songs.indexOf(s) + 1
            const m = media[`item:${s.item_id}`]
            const artwork = m?.artwork || m?.albumArtwork || undefined
            const isFav = Boolean(m?.favorite)
            const saving = favoritingIds.has(s.item_id)
            const completionPct = Math.round((s.completion || 0) * 100)
            const completionTone =
              completionPct >= 70 ? 'high' : completionPct >= 40 ? 'mid' : 'low'
            return (
              <div
                className="track-table-row"
                key={`${s.item_id || s.track_title}-${index}`}
                onClick={() => onSongClick(s.item_id)}
              >
                <span className="table-rank">{rank}</span>
                <div className="table-title">
                  <div className="table-cover">
                    {artwork ? (
                      <img src={artwork} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="capsule-art-fallback">
                        <span>♪</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <strong>{s.track_title || 'Song Name'}</strong>
                    <small className="table-title-artist">{s.artist_name || 'Artist Name'}</small>
                  </div>
                </div>
                <span className="table-album table-col-album">{s.album_name || 'Album Name'}</span>
                <span className="table-artist table-col-artist">
                  {s.artist_name || 'Artist Name'}
                </span>
                <span className="table-when table-col-when">
                  {formatRelativeTime(s.last_played)}
                </span>
                <span className="table-completion table-col-completion">
                  <span className={'table-badge ' + completionTone}>{completionPct}%</span>
                </span>
                <strong className="table-number table-col-plays">
                  {formatNumber(s.plays || 0)}
                </strong>
                <strong className="table-number table-col-mins">
                  {formatMinutes(s.listened_ms || 0)}
                </strong>
                <button
                  type="button"
                  className="table-fav table-col-fav"
                  aria-label={
                    isFav ? 'Remove from Jellyfin favourites' : 'Add to Jellyfin favourites'
                  }
                  aria-pressed={isFav}
                  disabled={saving}
                  onClick={e => {
                    e.stopPropagation()
                    onToggleFavorite(s.item_id, isFav)
                  }}
                >
                  <Heart size={14} fill={isFav ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
          {!filtered.length &&
            (query ? (
              <div className="top-tracks-empty compact">
                <Search size={22} />
                <strong>No matching songs</strong>
                <span>Try a different title, artist or album.</span>
              </div>
            ) : (
              <Locked message="Nothing here yet — keep listening and more songs will show up." />
            ))}
        </div>
      </section>
    </div>
  )
}
