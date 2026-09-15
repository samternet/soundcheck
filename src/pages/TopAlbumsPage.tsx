import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Disc3,
  Play,
  Search,
} from 'lucide-react'
import type { Dashboard, MediaInfo } from '../types'
import { formatNumber, formatMinutes } from '../lib/format'
import { Locked } from '../components/ui/primitives'

export function TopAlbumsPage({
  data,
  media,
  onAlbumClick,
}: {
  data: Dashboard | null
  media: Record<string, MediaInfo>
  onAlbumClick: (albumName: string, artistName: string) => void
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
  const albums = (data?.topAlbums || []).slice(0, 20)
  const topFive = albums.slice(0, 5)
  const topFiveMs = topFive.reduce((sum, a) => sum + Number(a.listened_ms || 0), 0)
  const rest = albums.slice(5, 20)
  const [albumScrollProgress, setAlbumScrollProgress] = useState(0)
  const [albumScrollable, setAlbumScrollable] = useState(false)
  const albumStageRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = albumStageRef.current
    if (!el) return
    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 1
      setAlbumScrollable(canScroll)
      setAlbumScrollProgress(canScroll ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0)
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
  const moveAlbums = (direction: number) => {
    albumStageRef.current?.scrollBy({
      left: direction * Math.max(240, (albumStageRef.current?.clientWidth || 500) * 0.62),
      behavior: 'smooth',
    })
  }
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (a: any) =>
      !q ||
      [a.album_name, a.artist_name].some(v =>
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
  const artwork = (album: any) =>
    media[`album:${album.album_name}::${album.artist_name}`]?.artwork ||
    media[`album:${album.album_name}`]?.artwork ||
    null
  return (
    <div className="top-albums-page">
      <div className="top-albums-heading">
        <div>
          <span className="top-albums-eyebrow">
            <Disc3 size={13} /> YOUR ALBUMS, HIGHLIGHTED
          </span>
          <h1>
            {topFive.length > 0
              ? 'Albums that stayed with you.'
              : 'Your music journey is just getting started.'}
          </h1>
          <p>
            {topFive.length > 0
              ? `These are the albums that soundtracked your ${data?.year || new Date().getFullYear()}.`
              : 'No album has stuck yet — the first one is still out there.'}
          </p>
        </div>
      </div>
      <section className="dark-hero">
        <div className="dark-hero-copy">
          <span className="dark-hero-kicker">♪ YOUR TOP 5 ALBUMS</span>
          <h2>{topFive.length > 0 ? 'More than songs.' : 'Nothing yet.'}</h2>
          <p>
            {topFiveMs
              ? `Together, these albums kept you listening for ${formatMinutes(topFiveMs)}.`
              : 'Your top 5 will appear here as you keep listening.'}
          </p>
        </div>
        <div className="dark-hero-visual" aria-label="Top five albums">
          {topFive.length > 0 && (
            <div className="dark-hero-note">
              Every album
              <br />
              has a story.
            </div>
          )}
          <div className="dark-hero-stage" ref={albumStageRef}>
            {topFive.map((album, i) => {
              const art = artwork(album)
              return (
                <article
                  key={`${album.album_name}-${album.artist_name}-${i}`}
                  className={'highlight-track ' + (i === 0 ? 'is-first' : '')}
                  onClick={() => onAlbumClick(album.album_name, album.artist_name)}
                >
                  <div className="highlight-cover">
                    {art ? (
                      <img src={art} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="capsule-art-fallback branded">
                        <span>◐</span>
                      </div>
                    )}
                  </div>
                  <div className="highlight-title">{album.album_name || 'Album Name'}</div>
                  <div className="highlight-artist">{album.artist_name || 'Artist Name'}</div>
                  <div className="highlight-stats">
                    <span>
                      <Play size={12} fill="currentColor" /> {formatNumber(album.plays || 0)} plays
                    </span>
                    <span>
                      <Clock3 size={12} /> {formatMinutes(album.listened_ms || 0)}
                    </span>
                  </div>
                  <div className="highlight-rank">#{i + 1}</div>
                </article>
              )
            })}
          </div>
          {albumScrollable && (
            <div className="dark-hero-scroll-controls">
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Previous albums"
                onClick={() => moveAlbums(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <div
                className="top5-scroll-track"
                role="scrollbar"
                aria-label="Album highlights scroll position"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(albumScrollProgress * 100)}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
                  const el = albumStageRef.current
                  if (el)
                    el.scrollTo({
                      left: ratio * (el.scrollWidth - el.clientWidth),
                      behavior: 'smooth',
                    })
                }}
              >
                <div
                  className="top5-scroll-thumb"
                  style={{ left: `${albumScrollProgress * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="top5-scroll-arrow"
                aria-label="Next albums"
                onClick={() => moveAlbums(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="all-albums-card">
        <div className="all-albums-head">
          <div>
            <h2>Albums 6–20</h2>
            <p>More albums that made {data?.year || new Date().getFullYear()} special.</p>
          </div>
          <div className="album-tools">
            <label className="album-search">
              <Search size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search albums…"
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
        <div className="albums-table-head">
          <span>#</span>
          <span>Album</span>
          <span className="album-col-artist">Artist</span>
          <span className="album-col-released align-right">Released</span>
          <span className="album-col-songs align-right">Songs played</span>
          <span className="album-col-time align-right">Listening time</span>
        </div>
        <div className="albums-table">
          {filtered.map((album, index) => {
            const rank = albums.indexOf(album) + 1
            const art = artwork(album)
            const albumMedia =
              media[`album:${album.album_name}::${album.artist_name}`] ||
              media[`album:${album.album_name}`]
            const trackCount = albumMedia?.trackCount || 0
            const releaseYear = albumMedia?.productionYear
            const uniqueSongs = album.unique_songs || 0
            return (
              <div
                className="album-table-row"
                key={`${album.album_name}-${album.artist_name}-${index}`}
                role="button"
                tabIndex={0}
                onClick={() => onAlbumClick(album.album_name, album.artist_name)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ')
                    onAlbumClick(album.album_name, album.artist_name)
                }}
              >
                <span className="album-table-rank">{rank}</span>
                <div className="album-table-name">
                  <div className="album-table-cover">
                    {art ? (
                      <img src={art} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span>◐</span>
                    )}
                  </div>
                  <strong>{album.album_name || 'Album Name'}</strong>
                </div>
                <span className="album-table-artist album-col-artist">
                  {album.artist_name || 'Artist Name'}
                </span>
                <span className="album-table-year album-col-released">{releaseYear || '—'}</span>
                <strong className="album-table-number album-col-songs">
                  {trackCount
                    ? `${formatNumber(uniqueSongs)} of ${formatNumber(trackCount)}`
                    : formatNumber(uniqueSongs)}
                </strong>
                <strong className="album-table-time album-col-time">
                  {formatMinutes(album.listened_ms || 0)}
                </strong>
              </div>
            )
          })}
          {!filtered.length &&
            (query ? (
              <div className="top-albums-empty compact">
                <Search size={22} />
                <strong>No matching albums</strong>
                <span>Try a different album or artist.</span>
              </div>
            ) : (
              <Locked message="Nothing here yet — keep listening and more albums will show up." />
            ))}
        </div>
      </section>
    </div>
  )
}
