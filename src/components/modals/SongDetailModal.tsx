import React, { useEffect } from 'react'
import { X, Heart, Play, Clock3, CheckCircle2, Zap, ExternalLink, ChevronRight } from 'lucide-react'
import type { SongDetail } from '../../types'
import { formatDuration, formatNumber, formatMinutes } from '../../lib/format'
import { months } from '../../lib/constants'
import { openJellyfinItem } from '../../lib/jellyfin-links'

export function SongDetailModal({
  detail,
  loading,
  error,
  onClose,
  onFavorite,
  favoriteSaving,
  onRefresh,
}: {
  detail: SongDetail | null
  loading: boolean
  error: string
  onClose: () => void
  onFavorite: () => void
  favoriteSaving: boolean
  onRefresh: () => void
}) {
  useEffect(() => {
    if (!detail) return
    const timer = window.setInterval(() => onRefresh(), 5000)
    return () => clearInterval(timer)
  }, [detail?.item.id, onRefresh])

  useEffect(() => {
    if (!detail && !loading && !error) return
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
  }, [detail, loading, error, onClose])
  const item = detail?.item
  const stats = detail?.stats
  const activity = detail?.activity || []
  const maxPlays = Math.max(...activity.map(x => Number(x.plays || 0)), 1)
  const listened = stats?.listened_ms || 0
  const completion = Math.round((stats?.avg_completion || 0) * 100)
  return (
    <div
      className="song-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="song-modal" role="dialog" aria-modal="true" aria-label="Song details">
        <button className="song-modal-close" aria-label="Close song details" onClick={onClose}>
          <X size={18} />
        </button>
        {loading && (
          <div className="song-modal-loading">
            <div className="loading-dot" />
            <span>Putting the song together…</span>
          </div>
        )}
        {!loading && error && (
          <div className="song-modal-error">
            <strong>Couldn't load this song</strong>
            <span>{error}</span>
            <button onClick={onClose}>Close</button>
          </div>
        )}
        {!loading && !error && item && stats && (
          <>
            <div className="song-modal-head">
              <div className="song-modal-art">
                {item.artwork ? (
                  <img src={item.artwork} alt="" loading="eager" decoding="async" />
                ) : (
                  <div className="art-fallback branded">
                    <span>♪</span>
                  </div>
                )}
              </div>
              <div className="song-modal-title">
                <span className="song-modal-kicker">SONG DETAILS · {detail.year}</span>
                <div className="song-modal-name-row">
                  <h2>{item.name || 'Untitled track'}</h2>
                  <button
                    className={'song-favorite ' + (detail.favorite ? 'active' : '')}
                    aria-label={
                      detail.favorite
                        ? 'Remove from Jellyfin favourites'
                        : 'Add to Jellyfin favourites'
                    }
                    aria-pressed={detail.favorite}
                    disabled={favoriteSaving}
                    onClick={onFavorite}
                  >
                    <Heart size={18} fill={detail.favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <p>{item.artistName || 'Unknown artist'}</p>
                <div className="song-modal-meta">
                  <span>{item.albumName || 'Unknown album'}</span>
                  {item.durationMs > 0 && <span>{formatDuration(item.durationMs)}</span>}
                  {item.genres?.[0] && <span>{item.genres[0]}</span>}
                </div>
              </div>
            </div>
            <div className="song-metrics">
              <div className="song-metric peach">
                <span className="song-metric-icon">
                  <Play size={15} fill="currentColor" />
                </span>
                <strong>{formatNumber(stats.plays)}</strong>
                <small>Plays</small>
                <em>Times you played it</em>
              </div>
              <div className="song-metric sand">
                <span className="song-metric-icon">
                  <Clock3 size={15} />
                </span>
                <strong>{formatMinutes(listened)}</strong>
                <small>Listening time</small>
                <em>Total time spent</em>
              </div>
              <div className="song-metric mint">
                <span className="song-metric-icon">
                  <CheckCircle2 size={15} />
                </span>
                <strong>{formatNumber(stats.completions)}</strong>
                <small>Completions</small>
                <em>Reached the finish</em>
              </div>
              <div className="song-metric coral">
                <span className="song-metric-icon">
                  <Zap size={15} />
                </span>
                <strong>{formatNumber(stats.skips)}</strong>
                <small>Skips</small>
                <em>Moved on early</em>
              </div>
            </div>
            <div className="song-modal-lower">
              <div className="song-about">
                <h3>About this song</h3>
                <div className="song-about-grid">
                  <span>Artist</span>
                  <strong>{item.artistName || '—'}</strong>
                  <span>Album</span>
                  <strong>{item.albumName || '—'}</strong>
                  <span>Average completion</span>
                  <strong>{completion}%</strong>
                  <span>Year</span>
                  <strong>{detail.year}</strong>
                </div>
              </div>
              <div className="song-activity">
                <div className="song-activity-head">
                  <h3>Your activity</h3>
                  <span>
                    {stats.plays
                      ? `Skipped ${Math.round((stats.skips / stats.plays) * 100)}% of the time`
                      : 'No plays yet'}
                  </span>
                </div>
                <div className="song-bars">
                  {Array.from({ length: 12 }, (_, i) => {
                    const row = activity.find(x => Number(x.month) === i + 1)
                    const value = Number(row?.plays || 0)
                    return (
                      <div className="song-bar-col" key={i}>
                        <div className="song-bar-wrap">
                          <div
                            className="song-bar"
                            style={{
                              height: `${value ? Math.max(12, (value / maxPlays) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span>{months[i]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="song-modal-actions">
              <button
                className="song-favorite-action"
                onClick={onFavorite}
                disabled={favoriteSaving}
              >
                <Heart size={16} fill={detail.favorite ? 'currentColor' : 'none'} />
                {detail.favorite ? 'In Jellyfin favourites' : 'Add to Jellyfin favourites'}
              </button>
              <button
                className="song-jellyfin-action"
                onClick={() => openJellyfinItem(item.jellyfinUrl)}
              >
                <ExternalLink size={16} /> Open in Jellyfin <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
