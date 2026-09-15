import React, { useEffect } from 'react'
import {
  X,
  Disc3,
  Crown,
  Play,
  Clock3,
  Music2,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import type { AlbumDetail, MediaInfo } from '../../types'
import { formatDate, formatNumber, formatMinutes } from '../../lib/format'
import { months } from '../../lib/constants'

export function AlbumDetailModal({
  detail,
  loading,
  error,
  onClose,
  media,
  onOpenJellyfin,
  onSongClick,
}: {
  detail: AlbumDetail | null
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
  const maxPlays = Math.max(...activity.map(x => Number(x.plays || 0)), 1)
  const completion =
    stats && item?.trackCount
      ? Math.round((stats.unique_songs / Math.max(item.trackCount, 1)) * 100)
      : 0
  const now = new Date()
  const monthsToShow = detail && Number(detail.year) === now.getFullYear() ? now.getMonth() + 1 : 12
  // Header used to restate "plays this year" verbatim from the metrics grid below;
  // show the album's peak month there instead so the header and grid don't say the same thing twice.
  const peakMonthIdx = activity.reduce(
    (best, row) =>
      Number(row.plays || 0) > Number(activity.find(r => Number(r.month) === best + 1)?.plays || 0)
        ? Number(row.month) - 1
        : best,
    -1,
  )
  const activeMonths = activity.filter(row => Number(row.plays || 0) > 0).length
  return (
    <div
      className="album-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="album-modal" role="dialog" aria-modal="true" aria-label="Album details">
        <button className="album-modal-close" aria-label="Close album details" onClick={onClose}>
          <X size={18} />
        </button>
        {loading && (
          <div className="album-modal-loading">
            <div className="loading-dot" />
            <span>Putting the album together…</span>
          </div>
        )}
        {!loading && error && (
          <div className="album-modal-error">
            <strong>Couldn't load this album</strong>
            <span>{error}</span>
            <button onClick={onClose}>Close</button>
          </div>
        )}
        {!loading && !error && item && stats && (
          <>
            <div className="album-modal-head">
              <div className="album-modal-art">
                {item.artwork ? (
                  <img src={item.artwork} alt="" loading="eager" decoding="async" />
                ) : (
                  <div className="album-modal-placeholder">
                    <Disc3 size={48} />
                  </div>
                )}
              </div>
              <div className="album-modal-title">
                <span className="album-modal-kicker">ALBUM DETAILS · {detail.year}</span>
                <div className="album-modal-name-row">
                  <h2>{item.name || 'Unknown album'}</h2>
                  {item.rank && item.rank <= 5 && (
                    <span className="album-rank-badge">
                      <Crown size={14} /> #{item.rank} album
                    </span>
                  )}
                </div>
                <p>{item.artistName || 'Unknown artist'}</p>
                <div className="album-modal-plays">
                  {peakMonthIdx >= 0
                    ? `Most played in ${months[peakMonthIdx]}`
                    : 'Building your listening story'}
                </div>
                <div className="album-modal-meta">
                  {item.productionYear && <span>Released in {item.productionYear}</span>}
                  <span>
                    {formatNumber(stats.unique_songs)} of {formatNumber(item.trackCount)} tracks
                    played
                  </span>
                  {stats.first_played && <span>First played {formatDate(stats.first_played)}</span>}
                </div>
              </div>
            </div>
            <div className="album-metrics">
              <div className="album-metric peach">
                <span className="album-metric-icon">
                  <Play size={15} fill="currentColor" />
                </span>
                <strong>{formatNumber(stats.plays)}</strong>
                <small>Plays</small>
                <em>Times you played this album</em>
              </div>
              <div className="album-metric sand">
                <span className="album-metric-icon">
                  <Clock3 size={15} />
                </span>
                <strong>{formatMinutes(stats.listened_ms)}</strong>
                <small>Listening time</small>
                <em>Total time spent listening</em>
              </div>
              <div className="album-metric mint">
                <span className="album-metric-icon">
                  <Music2 size={15} />
                </span>
                <strong>{formatNumber(stats.unique_songs)}</strong>
                <small>Songs played</small>
                <em>Unique songs from this album</em>
              </div>
              <div className="album-metric coral">
                <span className="album-metric-icon">
                  <CheckCircle2 size={15} />
                </span>
                <strong>{completion}%</strong>
                <small>Completion</small>
                <em>Share of album tracks you've heard</em>
              </div>
            </div>
            <div className="album-modal-lower">
              <div className="album-activity">
                <div className="album-activity-head">
                  <div>
                    <h3>Your listening history</h3>
                    <span>How your listening to this album changed throughout the year.</span>
                  </div>
                  <small>
                    {activeMonths} of {monthsToShow} months
                  </small>
                </div>
                <div
                  className="album-bars"
                  style={{ gridTemplateColumns: `repeat(${monthsToShow},1fr)` }}
                >
                  {Array.from({ length: monthsToShow }, (_, i) => {
                    const row = activity.find(x => Number(x.month) === i + 1)
                    const value = Number(row?.plays || 0)
                    return (
                      <div className="album-bar-col" key={i}>
                        <div className="album-bar-wrap">
                          <div
                            className="album-bar"
                            style={{
                              height: `${value ? Math.max(8, (value / maxPlays) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span>{months[i]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="album-top-songs">
                <div className="album-top-songs-head">
                  <div>
                    <h3>Your top songs</h3>
                    <span>The most listened-to songs from this album.</span>
                  </div>
                </div>
                <div className="album-song-list">
                  {detail.topSongs.map((song, i) => {
                    const m = media[`item:${song.item_id}`]
                    const artwork = m?.artwork || m?.albumArtwork
                    return (
                      <div
                        className="album-song-row"
                        key={song.item_id || i}
                        role="link"
                        tabIndex={0}
                        onClick={() => onSongClick(song.item_id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') onSongClick(song.item_id)
                        }}
                      >
                        <span>{i + 1}</span>
                        <div className="album-song-cover">
                          {artwork ? <img src={artwork} alt="" /> : <Music2 size={14} />}
                        </div>
                        <div className="album-song-copy">
                          <strong>{song.track_title || 'Song'}</strong>
                          <small>{formatNumber(song.plays)} plays</small>
                        </div>
                        <b>{formatMinutes(song.listened_ms)}</b>
                        <ExternalLink size={13} className="album-song-link" />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="album-modal-actions">
              <button className="album-close-action" onClick={onClose}>
                <X size={16} /> Close
              </button>
              <button className="album-jellyfin-action" onClick={onOpenJellyfin}>
                <ExternalLink size={16} /> Open album in Jellyfin <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
