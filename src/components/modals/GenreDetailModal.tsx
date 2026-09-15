import React, { useEffect, useMemo } from 'react'
import { X, Play, Clock3, Users, Music2, ExternalLink } from 'lucide-react'
import type { MediaInfo, Session } from '../../types'
import { formatNumber, formatMinutes } from '../../lib/format'
import { months, hourLabels, hourRanges } from '../../lib/constants'
import { genreArtPath, genreBucketValues } from '../../lib/genre-art'
import { openResolvedMedia, openItemInJellyfin } from '../../lib/jellyfin-links'

export function GenreDetailModal({
  genre,
  media,
  session,
  year,
  totalAttributed,
  onClose,
}: {
  genre: {
    genre: string
    plays: number
    listened_ms: number
    unique_tracks: number
    unique_artists: number
    monthly: number[]
    hourly: number[]
    topTrack?: { item_id: string; track_title: string; artist_name: string; plays: number } | null
    topArtist?: { artist_name: string; plays: number } | null
  }
  media?: Record<string, MediaInfo>
  session?: Session
  year: number
  totalAttributed: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])
  const share = Math.round((Number(genre.plays || 0) / Math.max(totalAttributed, 1)) * 100)
  const maxMonth = Math.max(...(genre.monthly || []), 1)
  // Header used to restate the artists/songs counts verbatim from the metrics grid below;
  // show the genre's peak month and active-month spread there instead.
  const peakMonthIdx = (genre.monthly || []).reduce(
    (best, v, i) => (v > (genre.monthly?.[best] || 0) ? i : best),
    -1,
  )
  const activeMonths = (genre.monthly || []).filter(v => Number(v || 0) > 0).length
  const peak = useMemo(() => {
    const buckets = genreBucketValues(genre.hourly)
    const total = Math.max(
      buckets.reduce((a, b) => a + b, 0),
      1,
    )
    const peakIndex = buckets.reduce((best, v, i) => (v > buckets[best] ? i : best), 0)
    return {
      range: hourRanges[peakIndex],
      label: hourLabels[peakIndex],
      pct: Math.round((buckets[peakIndex] / total) * 100),
    }
  }, [genre.hourly])
  const artistArtwork = media?.[`artist:${genre.topArtist?.artist_name || ''}`]?.artwork
  const trackArtwork = genre.topTrack?.item_id
    ? media?.[`item:${genre.topTrack.item_id}`]?.artwork ||
      media?.[`item:${genre.topTrack.item_id}`]?.albumArtwork
    : null
  return (
    <div
      className="genre-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="genre-modal" role="dialog" aria-modal="true" aria-label="Genre details">
        <button className="genre-modal-close" aria-label="Close genre details" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="genre-modal-head">
          <div className="genre-modal-art">
            <img
              src={genreArtPath(genre.genre)}
              alt=""
              onError={e => {
                const img = e.currentTarget
                if (img.dataset.fallback === '1') return
                img.dataset.fallback = '1'
                img.src = '/genre-art/default.webp'
              }}
            />
          </div>
          <div className="genre-modal-title">
            <span className="genre-modal-kicker">GENRE DETAILS · {year}</span>
            <h2>{genre.genre}</h2>
            <p>{share}% of your attributed genre listening</p>
            <div className="genre-modal-meta">
              {peakMonthIdx >= 0 && <span>Peaks in {months[peakMonthIdx]}</span>}
              <span>Active {activeMonths} of 12 months</span>
            </div>
          </div>
        </div>
        <div className="genre-modal-metrics">
          <div className="genre-modal-metric peach">
            <span className="genre-modal-metric-icon">
              <Play size={15} fill="currentColor" />
            </span>
            <strong>{formatNumber(Math.round(Number(genre.plays || 0)))}</strong>
            <small>Plays</small>
            <em>Attributed plays this year</em>
          </div>
          <div className="genre-modal-metric sand">
            <span className="genre-modal-metric-icon">
              <Clock3 size={15} />
            </span>
            <strong>{formatMinutes(genre.listened_ms)}</strong>
            <small>Listening time</small>
            <em>Total time spent in this genre</em>
          </div>
          <div className="genre-modal-metric mint">
            <span className="genre-modal-metric-icon">
              <Users size={15} />
            </span>
            <strong>{formatNumber(genre.unique_artists)}</strong>
            <small>Artists</small>
            <em>Unique artists in this genre</em>
          </div>
          <div className="genre-modal-metric coral">
            <span className="genre-modal-metric-icon">
              <Music2 size={15} />
            </span>
            <strong>{formatNumber(genre.unique_tracks)}</strong>
            <small>Songs</small>
            <em>Unique songs in this genre</em>
          </div>
        </div>
        <div className="genre-modal-lower">
          <div className="genre-modal-activity">
            <div className="genre-modal-activity-head">
              <div>
                <h3>Your listening history</h3>
                <span>How your listening to {genre.genre} changed throughout the year.</span>
              </div>
              <small>
                {activeMonths ? formatMinutes(genre.listened_ms / activeMonths) : '—'} avg/month
              </small>
            </div>
            <div className="genre-modal-bars">
              {Array.from({ length: 12 }, (_, i) => {
                const value = Number(genre.monthly?.[i] || 0)
                return (
                  <div className="genre-modal-bar-col" key={i}>
                    <div className="genre-modal-bar-wrap">
                      <div
                        className="genre-modal-bar"
                        style={{ height: `${value ? Math.max(8, (value / maxMonth) * 100) : 0}%` }}
                      />
                    </div>
                    <span>{months[i]}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="genre-modal-features">
            <div className="genre-modal-feature-head">
              <h3>Sound highlights</h3>
              <span>The artist and song that defined this genre for you.</span>
            </div>
            {genre.topArtist?.artist_name && (
              <div
                className="genre-modal-feature-row clickable"
                role="button"
                tabIndex={0}
                onClick={() =>
                  openResolvedMedia(
                    'artist',
                    genre.topArtist!.artist_name,
                    undefined,
                    session?.sessionId,
                  )
                }
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ')
                    openResolvedMedia(
                      'artist',
                      genre.topArtist!.artist_name,
                      undefined,
                      session?.sessionId,
                    )
                }}
              >
                <div className="genre-modal-feature-thumb">
                  {artistArtwork ? <img src={artistArtwork} alt="" /> : <Users size={18} />}
                </div>
                <div className="genre-modal-feature-copy">
                  <small>Top artist</small>
                  <strong>{genre.topArtist.artist_name}</strong>
                  {genre.topArtist.plays ? (
                    <span>
                      {formatNumber(Math.round(Number(genre.topArtist.plays || 0)))} plays
                    </span>
                  ) : null}
                </div>
                <ExternalLink size={13} className="genre-modal-feature-link" />
              </div>
            )}
            {genre.topTrack?.track_title && (
              <div
                className="genre-modal-feature-row clickable"
                role="button"
                tabIndex={0}
                onClick={() =>
                  openItemInJellyfin(
                    genre.topTrack!.item_id,
                    media?.[`item:${genre.topTrack!.item_id}`]?.jellyfinUrl,
                    session?.sessionId,
                  )
                }
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ')
                    openItemInJellyfin(
                      genre.topTrack!.item_id,
                      media?.[`item:${genre.topTrack!.item_id}`]?.jellyfinUrl,
                      session?.sessionId,
                    )
                }}
              >
                <div className="genre-modal-feature-thumb">
                  {trackArtwork ? <img src={trackArtwork} alt="" /> : <Music2 size={18} />}
                </div>
                <div className="genre-modal-feature-copy">
                  <small>Top track</small>
                  <strong>{genre.topTrack.track_title}</strong>
                  {genre.topTrack.artist_name ? <span>{genre.topTrack.artist_name}</span> : null}
                </div>
                <ExternalLink size={13} className="genre-modal-feature-link" />
              </div>
            )}
            {peak.range && (
              <div className="genre-modal-peak">
                <Clock3 size={14} />
                <span>
                  Peaks around <strong>{peak.range}</strong> ({peak.label.toLowerCase()}).
                </span>
                <b>{peak.pct}%</b>
              </div>
            )}
          </div>
        </div>
        <div className="genre-modal-actions">
          <button className="genre-modal-close-action" onClick={onClose}>
            <X size={16} /> Close
          </button>
        </div>
      </section>
    </div>
  )
}
