import React, { useEffect } from 'react'
import {
  X,
  Users,
  Crown,
  Play,
  Clock3,
  Music2,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import type { ArtistDetail, MediaInfo } from '../../types'
import { formatDate, formatNumber, formatMinutes } from '../../lib/format'
import { months } from '../../lib/constants'

export function ArtistDetailModal({
  detail,
  loading,
  error,
  onClose,
  media,
  onOpenJellyfin,
  onSongClick,
}: {
  detail: ArtistDetail | null
  loading: boolean
  error: string
  onClose: () => void
  media: Record<string, MediaInfo>
  onOpenJellyfin: () => void
  onSongClick: (itemId: string) => void
}) {
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
  const maxMinutes = Math.max(...activity.map(x => Number(x.listened_ms || 0)), 1)
  const completion = Math.round((stats?.avg_completion || 0) * 100)
  const now = new Date()
  const monthsToShow = detail && Number(detail.year) === now.getFullYear() ? now.getMonth() + 1 : 12
  // Header used to restate "plays"/"songs played" verbatim from the metrics grid below;
  // show the artist's peak month there instead so the header and grid don't say the same thing twice.
  const peakMonthIdx = activity.reduce(
    (best, row) =>
      Number(row.listened_ms || 0) >
      Number(activity.find(r => Number(r.month) === best + 1)?.listened_ms || 0)
        ? Number(row.month) - 1
        : best,
    -1,
  )
  const activeMonths = activity.filter(row => Number(row.listened_ms || 0) > 0).length
  return (
    <div
      className="artist-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="artist-modal" role="dialog" aria-modal="true" aria-label="Artist details">
        <button className="artist-modal-close" aria-label="Close artist details" onClick={onClose}>
          <X size={18} />
        </button>
        {loading && (
          <div className="artist-modal-loading">
            <div className="loading-dot" />
            <span>Putting the artist together…</span>
          </div>
        )}
        {!loading && error && (
          <div className="artist-modal-error">
            <strong>Couldn't load this artist</strong>
            <span>{error}</span>
            <button onClick={onClose}>Close</button>
          </div>
        )}
        {!loading && !error && item && stats && (
          <>
            <div className="artist-modal-head">
              <div className="artist-modal-art">
                {item.artwork ? (
                  <img src={item.artwork} alt="" loading="eager" decoding="async" />
                ) : (
                  <div className="artist-modal-placeholder">
                    <Users size={48} />
                  </div>
                )}
              </div>
              <div className="artist-modal-title">
                <span className="artist-modal-kicker">ARTIST DETAILS · {detail.year}</span>
                <div className="artist-modal-name-row">
                  <h2>{item.name || 'Unknown artist'}</h2>
                  {item.rank && item.rank <= 5 && (
                    <span className="artist-rank-badge">
                      <Crown size={14} /> #{item.rank} artist
                    </span>
                  )}
                </div>
                <p>
                  {peakMonthIdx >= 0
                    ? `Most played in ${months[peakMonthIdx]}`
                    : 'Building your listening story'}
                </p>
                <div className="artist-modal-meta">
                  {item.productionYear && <span>Debuted in {item.productionYear}</span>}
                  {stats.first_played && <span>First played {formatDate(stats.first_played)}</span>}
                </div>
              </div>
            </div>
            <div className="artist-metrics">
              <div className="artist-metric peach">
                <span className="artist-metric-icon">
                  <Play size={15} fill="currentColor" />
                </span>
                <strong>{formatNumber(stats.plays)}</strong>
                <small>Plays</small>
                <em>Times you played their music</em>
              </div>
              <div className="artist-metric sand">
                <span className="artist-metric-icon">
                  <Clock3 size={15} />
                </span>
                <strong>{formatMinutes(stats.listened_ms)}</strong>
                <small>Listening time</small>
                <em>Total time spent listening</em>
              </div>
              <div className="artist-metric mint">
                <span className="artist-metric-icon">
                  <Music2 size={15} />
                </span>
                <strong>{formatNumber(stats.unique_songs)}</strong>
                <small>Songs played</small>
                <em>Unique songs from this artist</em>
              </div>
              <div className="artist-metric coral">
                <span className="artist-metric-icon">
                  <CheckCircle2 size={15} />
                </span>
                <strong>{completion}%</strong>
                <small>Completion</small>
                <em>Average track completion</em>
              </div>
            </div>
            <div className="artist-modal-lower">
              <div className="artist-activity">
                <div className="artist-activity-head">
                  <div>
                    <h3>Your listening history</h3>
                    <span>How your listening to this artist changed throughout the year.</span>
                  </div>
                  <small>
                    {activeMonths} of {monthsToShow} months
                  </small>
                </div>
                <div
                  className="artist-bars"
                  style={{ gridTemplateColumns: `repeat(${monthsToShow},1fr)` }}
                >
                  {Array.from({ length: monthsToShow }, (_, i) => {
                    const row = activity.find(x => Number(x.month) === i + 1)
                    const value = Number(row?.listened_ms || 0)
                    return (
                      <div className="artist-bar-col" key={i}>
                        <div className="artist-bar-wrap">
                          <div
                            className="artist-bar"
                            style={{
                              height: `${value ? Math.max(8, (value / maxMinutes) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span>{months[i]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="artist-top-songs">
                <div className="artist-top-songs-head">
                  <div>
                    <h3>Your top songs</h3>
                    <span>The most listened-to songs from this artist.</span>
                  </div>
                </div>
                <div className="artist-song-list">
                  {detail.topSongs.map((song, i) => {
                    const m = media[`item:${song.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork
                    return (
                      <div
                        className="artist-song-row"
                        key={song.item_id || i}
                        role="link"
                        tabIndex={0}
                        onClick={() => onSongClick(song.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(song.item_id)
                        }}
                      >
                        <span>{i + 1}</span>
                        <div className="artist-song-cover">
                          {artwork ? <img src={artwork} alt="" /> : <Music2 size={14} />}
                        </div>
                        <div className="artist-song-copy">
                          <strong>{song.track_title || 'Song'}</strong>
                          <small>{formatNumber(song.plays)} plays</small>
                        </div>
                        <b>{formatMinutes(song.listened_ms)}</b>
                        <ExternalLink size={13} className="artist-song-link" />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="artist-modal-actions">
              <button className="artist-close-action" onClick={onClose}>
                <X size={16} /> Close
              </button>
              <button className="artist-jellyfin-action" onClick={onOpenJellyfin}>
                <ExternalLink size={16} /> Open artist in Jellyfin <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
