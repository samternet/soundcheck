import React from 'react'
import { ChevronRight } from 'lucide-react'
import { LogoIcon } from '../../lib/brand'

export function Brand({ desktop = false }: { desktop?: boolean }) {
  return (
    <div className={'brand ' + (desktop ? 'desktop-brand' : '')}>
      <span className="brand-mark">
        <LogoIcon size={18} strokeWidth={2.4} />
      </span>
      <span>
        Sound <b>Capsule</b>
      </span>
    </div>
  )
}
export function Stat({
  value,
  label,
  icon,
  sub,
}: {
  value: string
  label: string
  icon: React.ReactNode
  sub?: string
}) {
  return (
    <div className="hero-stat">
      <span className="hero-stat-icon">{icon}</span>
      <strong>{value}</strong>
      {sub && <em className="hero-stat-sub">{sub}</em>}
      <small>{label}</small>
    </div>
  )
}
export function MetricCard({
  icon,
  title,
  value,
  change,
  tone,
}: {
  icon: React.ReactNode
  title: string
  value: string
  change: string
  tone: string
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-title">{title}</div>
      <strong>{value}</strong>
      <span>{change}</span>
    </div>
  )
}
export function CardHeader({
  title,
  link,
  onLink,
}: {
  title: string
  link?: string
  onLink?: () => void
}) {
  return (
    <div className="card-header">
      <h3>{title}</h3>
      {link && (
        <button className="card-link" onClick={onLink}>
          {link}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}
export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <section className={'card ' + className} onClick={onClick}>
      {children}
    </section>
  )
}
export function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}
// Shown in place of a module that needs more listening history to mean
// anything yet — never hides the card itself, just swaps its content for a
// motivating line plus how close the unlock actually is.
// threshold omitted → a genuinely-empty state (no plays at all yet), which
// isn't on any day-based timer, so no progress bar/day-count is shown —
// same card, same warmth, just without a countdown that wouldn't mean anything.
export function Locked({
  message,
  elapsedDays,
  threshold,
}: {
  message: string
  elapsedDays?: number
  threshold?: number
}) {
  const showProgress = typeof threshold === 'number' && typeof elapsedDays === 'number'
  const progress = showProgress
    ? Math.max(0, Math.min(100, Math.round((elapsedDays! / threshold!) * 100)))
    : 0
  return (
    <div className="locked-module">
      <div className="locked-module-icon">♪</div>
      <p className="locked-module-message">{message}</p>
      {showProgress && (
        <>
          <div className="locked-module-track">
            <span className="locked-module-fill" style={{ width: `${progress}%` }} />
          </div>
          <small className="locked-module-days">
            {elapsedDays} of {threshold} days
          </small>
        </>
      )}
    </div>
  )
}
