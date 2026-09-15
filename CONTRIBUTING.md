# Contributing to Sound Capsule

Thanks for taking the time to contribute. This project is a self-hosted,
database-first Jellyfin companion — deliberately simple on the backend
(no webhooks, no third-party streaming APIs) and detailed on the frontend
(a lot of the value is in the stats and the polish). The notes below should
save you a round trip finding out how things are organized.

## Before you start

For anything more than a small fix (a new page, a schema change, a new
dependency), please open an issue first describing what you want to do.
It's a much shorter conversation before the work than after a finished PR.

## Running it locally

You need a Jellyfin server to point at — either your own, or a test instance.

```bash
docker compose up -d --build
```

This builds both containers (`sound-capsule-api` and `sound-capsule`)
and serves the app at `http://localhost:7096`. For faster iteration on the
frontend alone:

```bash
npm install
npm run dev
```

This runs Vite's dev server with hot reload, proxying `/api` to
`http://localhost:4000` (see `vite.config.ts`) — so you'll still need the
API container (or `cd server && npm run dev`) running alongside it.

Before opening a PR, make sure both of these pass clean:

```bash
npm run check     # format check + lint + type-check (client and server)
npm run build     # frontend production build
```

## Project structure

```
src/
  main.tsx              — render entrypoint only
  App.tsx                — app shell + dashboard page
  types.ts                — shared TypeScript types
  lib/                     — pure functions and shared plumbing:
                             api.ts      — the only place that calls fetch
                             config-ish  — constants.ts, storage.ts, version.ts
                             routes.ts   — the route table (one View type)
                             links.ts    — repository, support and credit URLs
                             format.ts, narrative.ts, genre-art.ts,
                             jellyfin-links.ts, theme.ts, unlock.ts
  components/
    ui/                    — small presentational primitives (Card, Stat, …)
    charts/                — the two custom SVG charts
    modals/                — the four detail popups (song/artist/album/genre)
  pages/                   — one file per nav destination

server/src/
  config.ts               — env, paths, timeouts, version, session constants
  index.ts                — Express routes
  db.ts                   — SQLite schema + queries (better-sqlite3)
  tracker.ts               — background poller against Jellyfin's /Sessions
  jellyfin.ts               — thin Jellyfin API client
  crypto.ts                — token encryption helpers
```

If you're adding a new page or modal, follow the existing pattern: it goes
in `pages/` or `components/modals/`, pulls shared helpers from `lib/`, and
imports UI primitives from `components/ui/` rather than redefining them.

## Assets: `public/` vs `dist/`

Static files (genre artwork, etc.) live in `public/`. **Never edit anything
in `dist/`** — it's a build output, deleted and regenerated from `public/`
and `src/` on every `npm run build` / `docker compose build`. An edit made
there will look like it worked and then silently disappear on the next
build. To replace genre artwork, for example, overwrite the relevant file
in `public/genre-art/` and rebuild.

## Database changes

The SQLite schema in `server/src/db.ts` follows one hard rule: **migrations
are additive only.** Add a column with the `addColumnIfMissing(table, column,
definition)` helper at the top of that file, and fill it for existing rows with
`backfillColumn` if it needs a value — never a `DROP`, a destructive rewrite,
or anything that could touch an existing installation's `play_events` history. People running this against months
of real listening data should never have to worry about an update wiping it.
New tables are always `CREATE TABLE IF NOT EXISTS`. If your change can't be
done additively, open an issue to discuss it before writing code.

## Code style

Formatting is handled by Prettier and is not a matter of taste — run
`npm run format` before committing, or let your editor format on save. The
settings live in `.prettierrc.json` (no semicolons, single quotes, 100
columns). Linting is `npm run lint` (oxlint, configured in `.oxlintrc.json`).

`npm run check` runs all three gates at once — format check, lint, and
type-check of both the client and the server — and is the quickest way to
confirm a change is ready.

Comments explain _why_, not _what_: a workaround, an invariant, a constraint
imposed by Jellyfin's API. Don't narrate code that already reads clearly.

Two things to prefer over inline literals:

- **Configuration and magic numbers** belong in `server/src/config.ts` or a
  named constant near the top of the module. Timeouts, limits, cache headers,
  the session header name and the app version all have one home each; nothing
  should be retyped at a call site.
- **API calls** go through `src/lib/api.ts` (`api.get` / `api.post` and the
  `endpoints` table), never a bare `fetch`. That module owns the session
  header, JSON handling and error shape.

## Commit / PR expectations

- Keep PRs focused on one thing. A bug fix doesn't need a drive-by refactor.
- Don't commit `dist/`, `node_modules/`, or anything under a local `data/`
  volume.
- If you touch the tracker's time-accounting logic (pause handling, repeat
  detection, completion ratio), explain your reasoning in the PR description
  — that code is easy to get subtly wrong and hard to unit-test by hand, so
  a clear explanation of _why_ is what actually gets reviewed carefully.
- Screenshots/GIFs for anything visual make review much faster.

## Reporting bugs

Please include your deployment shape — local network, Tailscale, reverse
proxy/public domain, or some combination — since a lot of real issues here
turn out to be topology-specific (see the three-bucket URL resolution in
`lib/jellyfin-links.ts` for why that matters).

## License

By contributing, you agree that your contributions will be licensed under
the project's AGPL-3.0 license (see `LICENSE`).
