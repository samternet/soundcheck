import React, { useEffect } from 'react'
import { X, Clock3, Play, Music2 } from 'lucide-react'
import type { MediaInfo } from '../../types'
import { formatNumber, formatMinutes } from '../../lib/format'

export function HourSongsModal({
  hour,
  songs,
  media,
  onClose,
  onSongClick,
}: {
  hour: number
  songs: {
    item_id: string
    track_title: string
    album_name: string
    artist_name: string
    plays: number
    listened_ms: number
  }[]
  media: Record<string, MediaInfo>
  onClose: () => void
  onSongClick: (itemId: string) => void
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

  const label = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`
  const endHour = (hour + 1) % 24
  const endLabel = `${endHour % 12 === 0 ? 12 : endHour % 12}:00 ${endHour < 12 ? 'AM' : 'PM'}`
  const totalPlays = songs.reduce((a, s) => a + Number(s.plays || 0), 0)
  const totalMs = songs.reduce((a, s) => a + Number(s.listened_ms || 0), 0)

  return (
    <div
      className="album-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        className="album-modal hour-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Songs played this hour"
      >
        <button className="album-modal-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="album-modal-head">
          <div className="album-modal-art hour-modal-art">
            <div className="album-modal-placeholder">
              <Clock3 size={40} />
            </div>
          </div>
          <div className="album-modal-title">
            <span className="album-modal-kicker">HOUR DETAILS · TODAY</span>
            <h2>
              {label} – {endLabel}
            </h2>
            <div className="album-modal-meta">
              <span>{formatNumber(totalPlays)} plays</span>
              <span>{formatMinutes(totalMs)}</span>
            </div>
          </div>
        </div>
        <div className="hour-modal-lower">
          {songs.length ? (
            <div className="hour-song-list">
              <div className="hour-song-row hour-song-row-head">
                <span>Song</span>
                <span>Plays</span>
                <span>Time</span>
              </div>
              {songs.map((song, i) => {
                const m = media[`item:${song.item_id}`]
                const artwork = m?.artwork || m?.albumArtwork
                return (
                  <div
                    className="hour-song-row"
                    key={song.item_id || i}
                    role="link"
                    tabIndex={0}
                    onClick={() => onSongClick(song.item_id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') onSongClick(song.item_id)
                    }}
                  >
                    <div className="hour-song-copy">
                      <div className="hour-song-cover">
                        {artwork ? <img src={artwork} alt="" /> : <Music2 size={14} />}
                      </div>
                      <div className="hour-song-text">
                        <strong>{song.track_title || 'Song'}</strong>
                        <small>
                          {song.album_name ? `${song.album_name} · ` : ''}
                          {song.artist_name || 'Unknown artist'}
                        </small>
                      </div>
                    </div>
                    <span>{formatNumber(song.plays)}</span>
                    <span>{formatMinutes(song.listened_ms)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="hour-modal-empty">
              <Play size={16} />
              <span>Nothing played in this hour.</span>
            </div>
          )}
        </div>
        <div className="hour-modal-actions">
          <button className="album-close-action" onClick={onClose}>
            <X size={16} /> Close
          </button>
        </div>
      </section>
    </div>
  )
}
