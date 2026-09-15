import React, { useEffect, useRef, useState } from 'react'
import {
  Bug,
  Check,
  Code,
  Coffee,
  Copy,
  Database,
  ExternalLink,
  EyeOff,
  Heart,
  Info,
  KeyRound,
  Newspaper,
  Scale,
  Server,
  ShieldCheck,
} from 'lucide-react'
import type { Me, Session } from '../types'
import { Card, CardHeader, Stat } from '../components/ui/primitives'
import { LINKS, displayUrl } from '../lib/links'
import { APP_VERSION } from '../lib/version'
import { APP_TAGLINE } from '../lib/brand'

/** How long the "Copied" confirmation stays on the Copy details button. */
const COPIED_RESET_MS = 2000

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

function PrivacyCheck({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="about-check">
      <span className="about-check-icon">{icon}</span>
      <div className="about-check-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  )
}

function ProjectLink({
  icon,
  title,
  detail,
  href,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  href: string
}) {
  return (
    <a className="about-link" href={href} {...externalLinkProps}>
      <span className="about-link-icon">{icon}</span>
      <span className="about-link-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <ExternalLink size={14} className="about-link-go" aria-hidden="true" />
    </a>
  )
}

/** Puts text on the clipboard, falling back to a hidden textarea where the async API is unavailable (plain-HTTP installs). */
async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(field)
  }
}

export function AboutPage({ session, me }: { session: Session; me: Me | null }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  const serverName = me?.serverName || session.serverName || 'Jellyfin server'
  const serverLabel = session.serverVersion
    ? `${serverName} · ${session.serverVersion}`
    : serverName
  const timezone = me?.timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone || '—'
  const installFacts: [string, string][] = [
    ['Version', `v${APP_VERSION}`],
    ['Jellyfin server', serverLabel],
    ['Signed in as', session.user.name],
    ['Timezone', timezone],
  ]

  async function copyDetails() {
    const text = [
      `Sound Capsule v${APP_VERSION}`,
      `Jellyfin: ${serverLabel}`,
      `Timezone: ${timezone}`,
      `Browser: ${navigator.userAgent}`,
    ].join('\n')
    try {
      await copyText(text)
      setCopied(true)
      window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      /* clipboard blocked — the details are still readable on screen */
    }
  }

  return (
    <div className="about-page">
      <div className="page-intro genre-page-intro">
        <span className="eyebrow">
          <Info size={14} /> ABOUT SOUND CAPSULE
        </span>
        <h1>Your music, remembered.</h1>
        <p>A year in review for the music you host yourself.</p>
      </div>

      <section className="hero about-hero">
        <div className="hero-bubbles bubble-a" />
        <div className="hero-copy">
          <div className="eyebrow">♪ {APP_TAGLINE.toUpperCase()}</div>
          <h1>Built for people who host their own music.</h1>
          <p>
            Sound Capsule quietly follows what you play on Jellyfin and turns it into your top
            tracks, artists, albums, genres and listening habits, without sending any of it anywhere
            else.
          </p>
          <a className="about-hero-button" href={LINKS.repository} {...externalLinkProps}>
            <Code size={15} /> View the code
          </a>
        </div>
        <div className="hero-stats">
          <Stat icon={<EyeOff size={18} />} value="0" label="data sent elsewhere" />
          <Stat icon={<Server size={18} />} value="100%" label="on your own server" />
          <Stat icon={<Scale size={18} />} value="AGPL-3.0" label="open source" />
          <Stat icon={<Heart size={18} />} value="Free" label="forever" />
        </div>
      </section>

      <section className="about-grid">
        <Card className="about-support">
          <Coffee className="about-support-cup" strokeWidth={1.3} aria-hidden="true" />
          <span className="eyebrow">
            <Heart size={13} /> SUPPORT THE PROJECT
          </span>
          <h2>Enjoying your Capsule?</h2>
          <p>
            Sound Capsule is free and built in spare time by one person. If it gave you a fun look
            at your own taste, a coffee helps keep the updates coming.
          </p>
          <div className="about-support-actions">
            {/* A plain link, not Buy Me a Coffee's embed script: loading their widget
                would bring third-party JavaScript into a page that promises none. */}
            <a className="coffee-button" href={LINKS.support} {...externalLinkProps}>
              <Coffee size={17} /> Buy me a coffee
            </a>
            <small>Opens {displayUrl(LINKS.support)}</small>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your privacy" />
          <p className="about-card-lede">What happens to your listening data.</p>
          <div className="about-checks">
            <PrivacyCheck
              icon={<Database size={15} />}
              title="Stays on this server"
              detail="Your history lives in this install's own database."
            />
            <PrivacyCheck
              icon={<KeyRound size={15} />}
              title="Passwords are never stored"
              detail="Only an encrypted Jellyfin access token is kept."
            />
            <PrivacyCheck
              icon={<ShieldCheck size={15} />}
              title="No tracking or ads"
              detail="No analytics or third-party scripts, on any page."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Open source" />
          <p className="about-card-lede">Read the code, suggest a feature, or report a problem.</p>
          <div className="about-links">
            <ProjectLink
              icon={<Code size={15} />}
              title="Source code"
              detail={displayUrl(LINKS.repository)}
              href={LINKS.repository}
            />
            <ProjectLink
              icon={<Bug size={15} />}
              title="Report a bug"
              detail="Open an issue on GitHub"
              href={LINKS.issues}
            />
            <ProjectLink
              icon={<Newspaper size={15} />}
              title="What's new"
              detail="Release notes and changelog"
              href={LINKS.releases}
            />
            <ProjectLink
              icon={<Scale size={15} />}
              title="License"
              detail="GNU AGPL-3.0"
              href={LINKS.license}
            />
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <h3>This install</h3>
            <button type="button" className="card-link" onClick={copyDetails}>
              {copied ? <Check size={12} /> : <Copy size={12} />}{' '}
              {copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
          <p className="about-card-lede">Handy to include when you report a bug.</p>
          <div className="about-facts">
            {installFacts.map(([label, value]) => (
              <div className="about-fact" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <p className="about-credits">
        <span>
          Made by{' '}
          <a href={LINKS.author} {...externalLinkProps}>
            samternet
          </a>
        </span>
        <span>
          Powered by{' '}
          <a href={LINKS.jellyfin} {...externalLinkProps}>
            Jellyfin
          </a>
        </span>
        <span>
          Icons by{' '}
          <a href={LINKS.lucide} {...externalLinkProps}>
            Lucide
          </a>
        </span>
      </p>
    </div>
  )
}
