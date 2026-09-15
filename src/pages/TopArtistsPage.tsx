import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Play,
  Search,
  Users,
} from 'lucide-react'
import type { Dashboard, MediaInfo } from '../types'
import { formatNumber, formatMinutes, formatRelativeTime } from '../lib/format'
import { getTopArtistsNarrative } from '../lib/narrative'
import { Locked } from '../components/ui/primitives'

export function TopArtistsPage({
  data,
  media,
  onArtistClick,
  trackingStartedAt,
}: {
  data: Dashboard | null
  media: Record<string, MediaInfo>
  onArtistClick: (artistName: string) => void
  trackingStartedAt: number
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'plays' | 'minutes'>('plays')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement | null>(null)
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
  const subcopy = 'The sounds that stayed with you.'
  const artists = (data?.topArtists || []).slice(0, 20)
  const topFive = artists.slice(0, 5)
  const topFiveMs = topFive.reduce((sum, a) => sum + Number(a.listened_ms || 0), 0)
  const rest = artists.slice(5, 20)
  const heroHeadline = useMemo(() => {
    const options = [
      'These are your people.',
      'The voices you kept choosing.',
      'The artists who got you through it.',
      'You kept coming back to them.',
      "They've been with you all year.",
    ]
    return options[Math.floor(Math.random() * options.length)]
  }, [])
  const artistStageRef = useRef<HTMLDivElement | null>(null)
  const [artistScrollProgress, setArtistScrollProgress] = useState(0)
  const [artistScrollable, setArtistScrollable] = useState(false)
  useEffect(() => {
    const el = artistStageRef.current
    if (!el) return
    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 1
      setArtistScrollable(canScroll)
      setArtistScrollProgress(canScroll ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0)
    }
    const centerFirst = () => {
      if (window.innerWidth > 800) {
        update()
        return
      }
      const first = el.querySelector('.highlight-track.is-first') as HTMLElement | null
      if (first)
        el.scrollLeft = Math.max(0, first.offsetLeft - (el.clientWidth - first.offsetWidth) / 2)
      update()
    }
    const id = window.setTimeout(centerFirst, 40)
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', centerFirst)
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      clearTimeout(id)
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', centerFirst)
      observer.disconnect()
    }
  }, [topFive.length])
  const moveArtists = (direction: number) => {
    artistStageRef.current?.scrollBy({
      left: direction * Math.max(220, (artistStageRef.current?.clientWidth || 420) * 0.62),
      behavior: 'smooth',
    })
  }
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (a: any) =>
      !q ||
      String(a.artist_name || '')
        .toLowerCase()
        .includes(q)
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
    <div className="top-artists-page">
      <div className="top-artists-heading">
        <div>
          <span className="top-artists-eyebrow">
            <Users size={13} /> YOUR ARTISTS, HIGHLIGHTED
          </span>
          <h1>
            {topFive.length > 0
              ? 'The artists shaping your music journey.'
              : 'Your music journey is just getting started.'}
          </h1>
          <p>
            {getTopArtistsNarrative(
              data?.year || new Date().getFullYear(),
              trackingStartedAt,
              Number(data?.totals?.plays || 0),
            )}
          </p>
        </div>
      </div>

      <section className="dark-hero">
        <div className="dark-hero-copy">
          <span className="dark-hero-kicker">♪ YOUR TOP 5 ARTISTS</span>
          <h2>{topFive.length > 0 ? heroHeadline : 'Nothing yet.'}</h2>
          <p>
            {topFiveMs
              ? `You gave these five artists ${formatMinutes(topFiveMs)} of your year.`
              : 'Your top 5 will appear here as you keep listening.'}
          </p>
        </div>
        <div className="dark-hero-visual" aria-label="Top five artists">
          {topFive.length > 0 && (
            <div className="dark-hero-note">
              Same voices.
              <br />
              New chapters.
            </div>
          )}
          <div className="dark-hero-stage" ref={artistStageRef}>
            {topFive.map((artist, i) => {
              const m = media[`artist:${artist.artist_name}`]
              const artwork = m?.artistArtwork || m?.artwork || undefined
              return (
                <article
                  key={artist.artist_name || i}
                  className={'highlight-track ' + (i === 0 ? 'is-first' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => onArtistClick(artist.artist_name)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') onArtistClick(artist.artist_name)
                  }}
                >
                  <div className="highlight-cover">
                    {artwork ? (
                      <img src={artwork} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="artist-placeholder">
                        <Users size={22} />
                      </div>
                    )}
                  </div>
                  <div className="highlight-title">{artist.artist_name || 'Artist Name'}</div>
                  <div className="highlight-stats">
                    <span>
                      <Play size={12} fill="currentColor" /> {formatNumber(artist.plays || 0)} plays
                    </span>
                    <span>
                      <Clock3 size={12} /> {formatMinutes(artist.listened_ms || 0)}
                    </span>
                  </div>
                  <div className="highlight-rank">#{i + 1}</div>
                </article>
              )
            })}
          </div>
          {artistScrollable && (
            <div className="dark-hero-scroll-controls">
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Previous artists"
                onClick={() => moveArtists(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <div
                className="top5-scroll-track"
                role="scrollbar"
                aria-label="Artist highlights scroll position"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(artistScrollProgress * 100)}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
                  const el = artistStageRef.current
                  if (el)
                    el.scrollTo({
                      left: ratio * (el.scrollWidth - el.clientWidth),
                      behavior: 'smooth',
                    })
                }}
              >
                <div
                  className="top5-scroll-thumb"
                  style={{ left: `${artistScrollProgress * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Next artists"
                onClick={() => moveArtists(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="all-artists-card">
        <div className="all-artists-head">
          <div>
            <h2>Artists 6–20</h2>
            <p>{subcopy}</p>
          </div>
          <div className="artist-tools">
            <label className="artist-search">
              <Search size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search artists…"
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
        <div className="artists-table-head">
          <span>#</span>
          <span>Artist</span>
          <span className="artist-col-when">Last played</span>
          <span className="artist-col-completion align-center">Avg. Completion</span>
          <span className="artist-col-songs align-right">Unique Songs</span>
          <span className="artist-col-plays align-right">Plays</span>
          <span className="artist-col-time align-right">Listening time</span>
        </div>
        <div className="artists-table">
          {filtered.map((artist, index) => {
            const rank = artists.indexOf(artist) + 1
            const m = media[`artist:${artist.artist_name}`]
            const artwork = m?.artistArtwork || m?.artwork || undefined
            const completionPct = Math.round((artist.avgCompletion || 0) * 100)
            const completionTone =
              completionPct >= 70 ? 'high' : completionPct >= 40 ? 'mid' : 'low'
            return (
              <div
                className="artist-table-row"
                key={`${artist.artist_name}-${index}`}
                role="button"
                tabIndex={0}
                onClick={() => onArtistClick(artist.artist_name)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') onArtistClick(artist.artist_name)
                }}
              >
                <span className="artist-table-rank">{rank}</span>
                <div className="artist-table-name">
                  <div className="artist-table-avatar">
                    {artwork ? (
                      <img src={artwork} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <Users size={16} />
                    )}
                  </div>
                  <strong>{artist.artist_name || 'Artist Name'}</strong>
                </div>
                <span className="artist-table-when artist-col-when">
                  {formatRelativeTime(artist.lastPlayed)}
                </span>
                <span className="artist-table-completion artist-col-completion">
                  <span className={'artist-table-badge ' + completionTone}>{completionPct}%</span>
                </span>
                <strong className="artist-table-songs artist-col-songs">
                  {formatNumber(artist.uniqueSongs || 0)}
                </strong>
                <strong className="artist-table-number artist-col-plays">
                  {formatNumber(artist.plays || 0)}
                </strong>
                <strong className="artist-table-time artist-col-time">
                  {formatMinutes(artist.listened_ms || 0)}
                </strong>
              </div>
            )
          })}
          {!filtered.length &&
            (query ? (
              <div className="top-artists-empty compact">
                <Search size={22} />
                <strong>No matching artists</strong>
                <span>Try a different artist name.</span>
              </div>
            ) : (
              <Locked message="Nothing here yet — keep listening and more artists will show up." />
            ))}
        </div>
      </section>
    </div>
  )
}
