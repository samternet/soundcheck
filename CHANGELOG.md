# Changelog

All notable changes to this project are documented here, newest first.

## v0.9.1

### Added

- Today/Year toggle on the Listening Clock; click an hour to see what you
  played then.

### Fixed

- Songs could permanently lose their artwork after a heavy listening
  session (an unbounded artwork batch request).
- Some songs failed to open with "Jellyfin item not found" after a library
  rescan reassigned their id; lookups now fall back to a title/artist match.

### Security

- Hardened per-user query scoping to only accept session-authenticated ids.

## v0.9.0 — Renamed to Soundcheck

The project formerly known as Sound Capsule is now **Soundcheck**. Spotify
runs a feature of its own called "Your Sound Capsule" — a personal listening
recap, the same kind of thing this project does — so the name changed to
avoid the overlap. Nothing else about the project changes: same features,
same license, same maintainer.

### Changed

- Renamed the project, repository, Docker containers/volume, session
  cookie/header, database file, and encryption-secret file from
  `sound-capsule`/`capsule` to `soundcheck`. A fresh `.env` var name,
  `SOUNDCHECK_PORT`, replaces `SOUND_CAPSULE_PORT`.
- The GitHub repository moved to
  [github.com/samternet/soundcheck](https://github.com/samternet/soundcheck);
  the old URL redirects automatically.

### Upgrading

- This is a rename, not a data migration: update your `.env`'s
  `SOUND_CAPSULE_PORT` to `SOUNDCHECK_PORT` (same value), update your git
  remote if you cloned the repo (`git remote set-url origin
  https://github.com/samternet/soundcheck.git`), then `docker compose up -d
  --build`. If you'd set `CAPSULE_SECRET` directly instead of letting it
  generate one, rename it to `SOUNDCHECK_SECRET`.

## v0.8.0 — First public beta

Sound Capsule leaves alpha and is released publicly as a beta. This release closes the security issues found in a
pre-release review, so it is safe to expose to the internet.

### Security

- **Fixed a server takeover through the login form.** Once a Jellyfin server
  was linked, the login endpoint still accepted a server address from the
  request. Anyone who was an administrator on their own Jellyfin could link
  their server in place of yours, after which your users' sign-ins would have
  been sent to it. Logins now always go to the linked server, and Sound Capsule
  refuses to connect if the server at that address has changed identity. A
  server address is only accepted during first-time setup.
- **Sign-in attempts are now limited.** After 10 failed attempts from one
  address within 15 minutes, further attempts are refused for the rest of that
  window. This stops password guessing through Sound Capsule and keeps it from
  triggering Jellyfin's own account lockout for your users.
- **Removed the permissive cross-origin setting.** The API previously allowed
  requests from any website. The web app and API share one address, so no
  cross-origin access is needed.

### Added

- An About page (`/about`), open to every user: what Sound Capsule is, how it
  handles your data, links to the source code, issues and release notes, the
  install's version details with a one-click "Copy details" for bug reports,
  and a Buy Me a Coffee link. Reachable from the sidebar, the version badge in
  the sidebar footer, and the profile menu.

### Changed

- Fonts are now bundled with the app instead of loaded from Google Fonts, so a
  visitor's browser no longer contacts any third party.
- Configuration moved to a `.env` file, with a documented `.env.example` to
  copy. `TZ` is now required: there is no default timezone, so every install
  counts days from its own midnight instead of silently using someone else's.
- Added `SOUND_CAPSULE_PORT` to change the port the app is served on.
- New tagline: "Your music taste, quantified".
- New logo: a music-note mark replaces the four-pointed star, and the star and
  sparkle decorations throughout the app are now music notes and sound waves.

### Fixed

- Dates showing in US order (9/11/2026) for browsers set to US English. Dates
  are now always written day first with the month as a word, such as
  11 Sep 2026, so they read the same in every country.
- Login failing on newer Jellyfin releases, which disable the legacy
  `X-Emby-Authorization` header by default. Sound Capsule now sends its client
  details and token in a single standard `Authorization: MediaBrowser …` header,
  which every Jellyfin release accepts.

### Upgrading

- Create a `.env` before starting: `cp .env.example .env`, then set `TZ`. The
  old default was `Asia/Kolkata`, so set `TZ=Asia/Kolkata` to keep your
  statistics grouped exactly as before. Recorded plays are never changed; `TZ`
  only affects how they are grouped into days and months.

## v0.7.0-alpha — Community-ready release

- Added three-bucket Jellyfin URL resolution: "Open in Jellyfin" links now
  automatically use the right address (local network, Tailscale, or public
  domain) depending on how the browser is currently reaching Sound Capsule,
  with a sensible fallback chain if one isn't configured.
- Added a "Remote Access URLs" section to Admin Settings so an admin can
  set/edit the public domain and Tailscale addresses for Jellyfin at any
  time, without re-authenticating.
- Added optional `JELLYFIN_PUBLIC_URL` and `JELLYFIN_TAILSCALE_URL`
  environment variables for zero-touch Docker setup of the two new URLs.
- Fixed "Open in Jellyfin" links carrying over the local server's port
  (e.g. `:8096`) onto the public domain, which used a different port — the
  URL rewrite now clears the port explicitly instead of relying on it being
  overwritten implicitly.
- Switched "Open in Jellyfin" navigation to a synthetic link click instead
  of `window.open(...)`, fixing links opening a blank tab on iOS Safari and
  Chrome for iOS.
- Fixed every user's profile picture showing whichever user's photo the
  browser cached first — profile artwork URLs are now unique per user and
  image version, so each account's photo loads and caches independently.
- Fixed each login sending Jellyfin the same hardcoded device identity,
  which meant a second login (another browser, or the same account from a
  different network) could invalidate a token an already-open tab was still
  using. Every login and the background tracker's admin connection now get
  their own unique device identity.
- Added persistent login sessions — being logged in now survives a
  container rebuild or restart instead of requiring a fresh login every
  time, and only ends on explicit logout or natural expiry.
- Removed duplicate statistics that were shown two or three times within
  the same screen (Artist, Album, Song, and Genre detail popups; the Home
  dashboard; the Genres page; Top Tracks/Top Albums) — each now surfaces a
  distinct stat instead of repeating a number already visible elsewhere on
  the same view.
- Redesigned the Genres page's top-5 hero cards to match the Top Tracks
  hero card's look (smaller heading font, larger/more spacious cards that
  fill the available width, horizontal scroll controls that only appear
  when the cards actually don't fit).
- Reworked the Activity page's listening-clock and weekly-radar charts:
  more margin so hour labels never crowd the edge, a warmer/more cohesive
  color palette, full weekday names, and a taller "Year at a Glance"
  calendar so month labels never overlap the heatmap.
- Removed the redundant "View song details" button from Top Tracks
  highlight cards, since clicking the card already opens the details.
- Renamed "Disconnect" to "Log Out" in the profile menu and Settings page,
  since "Disconnect" read as disconnecting Jellyfin tracking rather than
  simply signing out.
- Restructured the entire frontend out of one ~1,800-line `main.tsx` into
  `types.ts`, `lib/`, `components/ui`, `components/charts`,
  `components/modals`, and `pages/`, with `main.tsx` reduced to the render
  entrypoint. No behavior change — verified with a full rebuild and a live
  smoke test of every page and popup.
- Added `LICENSE` (AGPL-3.0), `CONTRIBUTING.md`, and `.gitignore` ahead of
  opening the project up to the community.
