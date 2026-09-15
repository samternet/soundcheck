import type { MediaInfo } from '../types'
import { api, endpoints } from './api'

// Every jellyfinUrl the backend hands us is built from the local/internal
// server address (the only one it can rely on for its own outbound calls).
// When the browser itself is reachable from outside that local network, the
// local origin in that URL may not be reachable from here — so before
// opening any Jellyfin link we swap in whichever "bucket" URL fits how this
// browser is currently connected. Module-level (not component state) because
// openJellyfinItem is called from many places that don't carry session data.
export let jellyfinUrlOverrides: { publicUrl?: string | null; tailscaleUrl?: string | null } = {}
export function setJellyfinUrlOverrides(publicUrl?: string | null, tailscaleUrl?: string | null) {
  jellyfinUrlOverrides = { publicUrl, tailscaleUrl }
}
export function classifyNetworkContext(hostname: string): 'local' | 'tailscale' | 'domain' {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return 'local'
  if (
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)
  )
    return 'local'
  if (h.endsWith('.ts.net') || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(h))
    return 'tailscale'
  return 'domain'
}
export function resolveJellyfinBase(): string | null {
  const bucket = classifyNetworkContext(window.location.hostname)
  if (bucket === 'local') return null
  if (bucket === 'tailscale')
    return jellyfinUrlOverrides.tailscaleUrl || jellyfinUrlOverrides.publicUrl || null
  return jellyfinUrlOverrides.publicUrl || null
}
export function openJellyfinItem(url: string) {
  try {
    const base = resolveJellyfinBase()
    if (base) {
      const target = new URL(url)
      const preferred = new URL(base)
      target.protocol = preferred.protocol
      target.hostname = preferred.hostname
      // The URL `host` setter only updates the hostname when the new value has no
      // port, silently keeping the old one — set port explicitly (to '' for the
      // default 80/443) so a local address's :8096 never leaks into the rewritten URL.
      target.port = preferred.port
      url = target.toString()
    }
  } catch {}
  // iOS Safari/Chrome (WebKit) can leave window.open(url,'_blank','noopener,noreferrer')
  // stuck on a blank tab for cross-origin targets. A synthetic anchor click is the
  // reliable cross-browser way to open a new tab, so use that instead.
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
/**
 * Opens an artist or album that is only known by name — the Genres view has no
 * Jellyfin item id for them, so the server resolves the name to one first.
 */
export async function openResolvedMedia(
  kind: 'artist' | 'album',
  name: string,
  artist?: string,
  sessionId?: string,
) {
  const type = kind === 'artist' ? 'MusicArtist' : 'MusicAlbum'
  const resolved = await api.tryGet<MediaInfo>(
    endpoints.mediaResolve(type, name, kind === 'album' ? artist : undefined),
    { sessionId },
  )
  if (resolved?.jellyfinUrl) openJellyfinItem(resolved.jellyfinUrl)
}

export async function openItemInJellyfin(
  itemId: string,
  cachedUrl?: string | null,
  sessionId?: string,
) {
  if (cachedUrl) {
    openJellyfinItem(cachedUrl)
    return
  }
  if (!itemId) return
  const info = await api.tryGet<MediaInfo>(endpoints.media(itemId), { sessionId })
  if (info?.jellyfinUrl) openJellyfinItem(info.jellyfinUrl)
}
