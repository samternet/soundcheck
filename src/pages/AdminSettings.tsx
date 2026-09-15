import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Settings, Server, ShieldCheck, LockOpen } from 'lucide-react'
import type { Session, Me } from '../types'
import { Card } from '../components/ui/primitives'
import { setJellyfinUrlOverrides } from '../lib/jellyfin-links'
import { getUnlocks } from '../lib/unlock'
import { api, endpoints } from '../lib/api'

export function AdminSettings({
  session,
  me,
  onBack,
  onLogout,
  trackingStartedAt,
  unlockOverride,
  onUnlockOverrideChanged,
}: {
  session: Session
  me: Me | null
  onBack: () => void
  onLogout: () => void
  trackingStartedAt?: number
  unlockOverride: boolean
  onUnlockOverrideChanged: () => void
}) {
  const [message, setMessage] = useState('')
  const [togglingOverride, setTogglingOverride] = useState(false)
  const naturallyFull = getUnlocks(trackingStartedAt).full
  async function toggleUnlockOverride() {
    setTogglingOverride(true)
    try {
      await api.post(
        endpoints.unlockOverride,
        { enabled: !unlockOverride },
        { sessionId: session.sessionId },
      )
      onUnlockOverrideChanged()
    } finally {
      setTogglingOverride(false)
    }
  }
  const [publicUrl, setPublicUrl] = useState(me?.jellyfinPublicUrl || '')
  const [tailscaleUrl, setTailscaleUrl] = useState(me?.jellyfinTailscaleUrl || '')
  // Loading Settings by a direct URL/refresh mounts this before `me` has finished its
  // async fetch, so the useState initializers above can lock in empty strings. Seed the
  // fields once `me` actually arrives — but only the first time, so a later background
  // poll of `me` (every 15s) never clobbers URLs the admin is actively editing.
  const seededFromMe = useRef(false)
  useEffect(() => {
    if (me && !seededFromMe.current) {
      setPublicUrl(me.jellyfinPublicUrl || '')
      setTailscaleUrl(me.jellyfinTailscaleUrl || '')
      seededFromMe.current = true
    }
  }, [me])
  const [urlMessage, setUrlMessage] = useState('')
  const [savingUrls, setSavingUrls] = useState(false)
  async function syncNow() {
    setMessage('')
    try {
      await api.post(endpoints.syncNow, undefined, { sessionId: session.sessionId })
      setMessage('Background sync refreshed from Jellyfin.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to refresh sync')
    }
  }
  async function saveUrls() {
    setSavingUrls(true)
    setUrlMessage('')
    try {
      const saved = await api.post<{
        jellyfinPublicUrl: string | null
        jellyfinTailscaleUrl: string | null
      }>(endpoints.serverUrls, { publicUrl, tailscaleUrl }, { sessionId: session.sessionId })
      setPublicUrl(saved.jellyfinPublicUrl || '')
      setTailscaleUrl(saved.jellyfinTailscaleUrl || '')
      setJellyfinUrlOverrides(saved.jellyfinPublicUrl, saved.jellyfinTailscaleUrl)
      setUrlMessage('Saved.')
    } catch (e) {
      setUrlMessage(e instanceof Error ? e.message : 'Unable to save URLs')
    } finally {
      setSavingUrls(false)
    }
  }
  return (
    <div className="settings-shell">
      <div className="settings-top">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Soundcheck
        </button>
        <div className="settings-title">
          <div className="settings-icon">
            <Settings size={23} />
          </div>
          <div>
            <h1>Server Settings</h1>
            <p>Background sync and connection details.</p>
          </div>
        </div>
      </div>
      <div className="settings-grid">
        <Card>
          <div className="setting-heading">
            <Server size={18} />
            <div>
              <h3>Jellyfin Server</h3>
              <small>Connected server</small>
            </div>
          </div>
          <div className="setting-row">
            <span>Server</span>
            <strong>{me?.serverName || session.serverName || '—'}</strong>
          </div>
          <div className="setting-row">
            <span>Address</span>
            <strong>{me?.jellyfinUrl || session.jellyfinUrl}</strong>
          </div>
          <div className="setting-row">
            <span>Connected admin</span>
            <strong>{me?.connectedAdmin || '—'}</strong>
          </div>
          <div className="setting-row">
            <span>Status</span>
            <strong className="setting-ok">
              <span className={'online ' + (me?.serverTracking ? '' : 'offline')} />{' '}
              {me?.serverTracking ? 'Connected' : 'Not Connected'}
            </strong>
          </div>
        </Card>
        <Card>
          <div className="setting-heading">
            <ShieldCheck size={18} />
            <div>
              <h3>Background Statistics</h3>
              <small>Quiet background collection</small>
            </div>
          </div>
          <div className="setting-row">
            <span>Source</span>
            <strong>Jellyfin /Sessions</strong>
          </div>
          <div className="setting-row">
            <span>Interval</span>
            <strong>Every 5 seconds</strong>
          </div>
          <div className="privacy-box">
            <strong>Soundcheck works quietly in the background.</strong>
            <p>
              Listening statistics are collected gradually from Jellyfin's standard Sessions API.
            </p>
          </div>
          <button className="settings-disconnect" onClick={syncNow}>
            Refresh background sync
          </button>
          {message && <div className="empty-state">{message}</div>}
        </Card>
        <Card className="settings-span-2">
          <div className="setting-heading">
            <Server size={18} />
            <div>
              <h3>Remote Access URLs</h3>
              <small>Used only to open Jellyfin links from outside your local network</small>
            </div>
          </div>
          <label className="setting-label" htmlFor="public-jellyfin-url">
            Public domain URL
          </label>
          <input
            id="public-jellyfin-url"
            className="setting-input"
            type="text"
            placeholder="https://jellyfin.mydomain.com"
            value={publicUrl}
            onChange={e => setPublicUrl(e.target.value)}
          />
          <label className="setting-label" htmlFor="tailscale-jellyfin-url">
            Tailscale URL
          </label>
          <input
            id="tailscale-jellyfin-url"
            className="setting-input"
            type="text"
            placeholder="http://100.x.x.x:8096"
            value={tailscaleUrl}
            onChange={e => setTailscaleUrl(e.target.value)}
          />
          <button className="settings-disconnect" onClick={saveUrls} disabled={savingUrls}>
            {savingUrls ? 'Saving…' : 'Save URLs'}
          </button>
          {urlMessage && <div className="empty-state">{urlMessage}</div>}
        </Card>
        {!naturallyFull && (
          <Card className="settings-span-2">
            <div className="setting-heading">
              <LockOpen size={18} />
              <div>
                <h3>Unlock All Widgets</h3>
                <small>
                  Soundcheck unlocks more widgets as your listening history grows, but you can
                  unlock all widgets now by toggling the switch below.
                </small>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unlockOverride}
              className={'settings-toggle ' + (unlockOverride ? 'on' : '')}
              onClick={toggleUnlockOverride}
              disabled={togglingOverride}
            >
              <span className="settings-toggle-thumb" />
            </button>
            <span className="settings-toggle-label">
              {unlockOverride
                ? 'Everything unlocked for your account'
                : 'Unlock everything early for your account'}
            </span>
          </Card>
        )}
      </div>
      <button className="settings-disconnect" onClick={onLogout}>
        Log Out
      </button>
    </div>
  )
}
