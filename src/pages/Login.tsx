import React, { useState, useEffect } from 'react'
import { ShieldCheck, ChevronRight } from 'lucide-react'
import type { Session } from '../types'
import { api, endpoints } from '../lib/api'
import { STORAGE_KEYS, safeStorage } from '../lib/storage'
import { APP_TAGLINE, LogoIcon } from '../lib/brand'

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [jellyfinUrl, setJellyfinUrl] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null)
  const [serverName, setServerName] = useState('')
  useEffect(() => {
    let cancelled = false
    api
      .get<{ configured: boolean; serverName?: string; jellyfinUrl?: string }>(
        endpoints.serverInfo,
        { noStore: true },
      )
      .then(info => {
        if (cancelled) return
        setServerConfigured(Boolean(info.configured))
        if (info.configured) setServerName(String(info.serverName || ''))
        else if (info.jellyfinUrl) setJellyfinUrl(String(info.jellyfinUrl))
      })
      .catch(() => {
        if (!cancelled) setServerConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await api.post<Session>(endpoints.login, {
        jellyfinUrl,
        username,
        password,
      })
      safeStorage.set(localStorage, STORAGE_KEYS.session, JSON.stringify(session))
      onLogin(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect to Jellyfin')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="login-shell">
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <LogoIcon size={19} strokeWidth={2.4} />
          </span>
          <strong>Sound Capsule</strong>
          <small>{APP_TAGLINE}</small>
        </div>
        <div className="login-illustration">
          <div className="login-disc">♫</div>
          <div className="login-spark">♪</div>
        </div>
        <form onSubmit={submit}>
          <div className="login-heading">
            <span>Your music</span>
            <h1>Capsuled.</h1>
            <p>
              Sign in with your Jellyfin account and turn your listening history into a beautiful
              year-in-review.
            </p>
          </div>
          {serverConfigured ? (
            <div className="login-server-note">
              <ShieldCheck size={14} /> Connected to{' '}
              <strong>{serverName || 'your Jellyfin server'}</strong>
            </div>
          ) : (
            serverConfigured === false && (
              <label>
                Jellyfin server
                <input
                  value={jellyfinUrl}
                  onChange={e => setJellyfinUrl(e.target.value)}
                  placeholder="http://192.168.1.10:8096"
                  autoComplete="url"
                />
              </label>
            )
          )}
          <label>
            Username
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Jellyfin username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Jellyfin password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Connecting…' : 'Enter my Capsule'} <ChevronRight size={17} />
          </button>
          <small className="login-note">
            Passwords are never stored. Only the encrypted Jellyfin access token is kept locally.
          </small>
        </form>
      </div>
    </div>
  )
}
