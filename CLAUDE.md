@AGENTS.md

# Thermal Heatmap

UK thermal heatmap for glider pilots, showing thermals detected from BGA Ladder and WeGlide flight data plus live OGN tracker positions.

## Architecture

```
Cloudflare Pages (thermal.gliderzone.com)      → Vite SPA (read-only UI)
Fly.io worker   (api.thermal.gliderzone.com)   → Hono API + background processing
Neon                                            → PostgreSQL (shared)
```

The UI is a static SPA that reads cached data from the worker API. The worker fetches flights from BGA/WeGlide, detects thermals, and polls live tracker positions — all on background timers. The client never triggers processing.

## Tech Stack

- **Frontend:** Vite + React 19, Tailwind CSS v4, Leaflet
- **Worker:** Hono + Node.js (tsx runtime), Prisma v7 adapter pattern
- **ORM:** Prisma v7 (shared schema at repo root, generated into `thermal-worker/`)
- **Database:** PostgreSQL (Docker locally, Neon in production)
- **Deployment:** Cloudflare Pages (web) + Fly.io (worker), via GitHub Actions
- **External APIs:** BGA Ladder, WeGlide, tracker API (api.tracker.gliderzone.com)

## Project Structure

```
web/                          Vite SPA (Cloudflare Pages)
  src/app/ThermalMap.tsx      Main UI component
  src/components/             12 UI components (map, panels, filters)
  src/lib/api.ts              apiUrl() helper (VITE_API_BASE)
  src/lib/types.ts            Client-side type definitions
  src/lib/units.ts            Metric/UK unit formatting

thermal-worker/               Hono worker (Fly.io)
  src/index.ts                Entry point — HTTP server + background loops
  src/db.ts                   Prisma client singleton
  src/processor.ts            Background: fetch flights, detect thermals (15 min)
  src/live-poller.ts          Background: poll tracker positions (30 sec)
  src/live-state.ts           Shared tracker status for /live/thermals route
  src/auth.ts                 JWT verification middleware (requireUser) — GLI-203
  src/routes/                 6 GET routes (thermals, flights, processed-dates,
                              activity-calendar, live/thermals, me [gated])
  src/lib/                    Business logic (providers, parsers, detectors)
  Dockerfile, fly.toml        Fly.io deployment config

prisma/                       Shared Prisma schema + migrations
prisma.config.ts              Database URL (reads DATABASE_URL env var)
docker-compose.yml            Local Postgres on port 5444
```

## Local Development

```bash
docker compose up -d                              # Postgres on port 5444

# Worker (must start first — the SPA talks to it)
cd thermal-worker && npm install && npm run dev    # Hono on port 8080

# Web
cd web && npm install && npm run dev               # Vite on port 5173

# Prisma
npx prisma migrate dev                             # Apply migrations
npx prisma studio                                  # Browse DB
npx prisma generate                                # Regenerate client
```

Local DB connection: `postgresql://postgres:postgres@localhost:5444/thermal_heatmap`

The worker needs `DATABASE_URL` set (local Postgres) and optionally `TRACKER_API_KEY` for live thermals. The web SPA reads `VITE_API_BASE` from `web/.env` (defaults to `http://localhost:8080`).

## Deployment

Two independent GitHub Actions workflows, triggered by changes to their respective directories:

- **`deploy-web.yml`** — Vite build → Cloudflare Pages. Triggers on `web/` changes.
- **`deploy-worker.yml`** — Prisma migrate + `flyctl deploy`. Triggers on `thermal-worker/` or `prisma/` changes.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, `FLY_API_TOKEN`.

The GitHub `DATABASE_URL` secret is used **only** by `prisma migrate deploy` in `deploy-worker.yml`, so it must be the Neon **direct** (unpooled) URL — pooled/PgBouncer connections are unreliable for migrations. The Fly.io worker reads its **own** `DATABASE_URL` secret at runtime via a `pg` Pool (`thermal-worker/src/db.ts`), so that one must be the Neon **pooled** URL. The worker also needs `TRACKER_API_KEY` as a Fly.io secret.

To run migrations against production manually (use the **direct**, unpooled URL):
```bash
DATABASE_URL="<neon-direct-url>" npx prisma migrate deploy
```

## Prisma v7 Gotchas

1. **No `url` in schema.prisma** — Connection URL goes in `prisma.config.ts` only.
2. **Adapter pattern** — The client requires an explicit adapter:
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
   new PrismaClient({ adapter });
   ```
3. **Generated client location** — Output is `thermal-worker/generated/prisma` (gitignored). Import from `../generated/prisma/client.ts`.
4. **Provider is `prisma-client`** not `prisma-client-js`.
5. **`@prisma/adapter-pg`** is the correct package (not `@prisma/pg-worker` which is v6).

## Neon Notes

- **Shared project** — since June 2026 (GLI-193) this app's database lives in the **`gliderzone-continuous`** Neon project (`damp-fire-29117629`, pg18) as the logical database `thermal`, owned by the role `thermal_owner`. There is no separate thermal-heatmap Neon project any more. The tracker app's `tracker` DB shares the same branch and compute — see `../TECH-STACK.md` § Database for the two-bucket topology and the surgical-restore runbook (no one-click rewind on a shared branch).
- **Pooled vs direct** — Neon exposes two endpoint hosts for the same database:
  - **Direct** (`ep-<id>.<region>.aws.neon.tech`) — for migrations (`prisma migrate deploy`) and any DDL/admin work. This is the GitHub `DATABASE_URL` secret.
  - **Pooled** (`ep-<id>-pooler.<region>.aws.neon.tech`) — PgBouncer endpoint for the long-lived worker runtime. This is the Fly.io `DATABASE_URL` secret.
  - The only difference in the URL is the `-pooler` suffix on the host. Both carry `?sslmode=require&channel_binding=require`.
- **Connection strings** — `neonctl connection-string production --project-id damp-fire-29117629 --database-name thermal --role-name thermal_owner [--pooled]`.
- **Region** — project lives in `aws-eu-west-2` (London), matching the Fly worker's `lhr`.
- **Compute** — always-on (no auto-suspend), autoscaling capped at 0.25–1 CU. Shared with the tracker app, so be a good neighbour: `thermal_owner` is connection-limited with a `statement_timeout`.
- **Branching** — Neon can branch the database (copy-on-write) for preview deploys or testing a migration in isolation: `neonctl branches create --project-id <id> --name <branch>` gives an independent endpoint you can point a throwaway `DATABASE_URL` at, then `neonctl branches delete` when done. Note a branch carries **all** logical DBs on it, including tracker's.
- **CLI** — manage via `neonctl` (`npm i -g neonctl`, `neonctl auth`). Pass `--org-id org-red-mountain-30357839` in non-interactive contexts.

## Conventions

- Auth via the shared platform (GLI-203): the SPA uses `@gliderzone/auth-client` for Google login + the cross-app SSO cookie, and the worker validates the JWT locally (`thermal-worker/src/auth.ts`, `requireUser`) on gated routes. The first gated route is `GET /me`; most data routes remain public. No error boundaries — this is still a proof of concept. Both packages have ESLint (`npm run lint`), and the worker has a `node --test` suite (`npm test` in `thermal-worker/`); CI runs these before deploying.
- The worker processes BGA + WeGlide for today and yesterday every 15 minutes.
- Live thermals poll the tracker API every 30 seconds.
- The SPA polls `/thermals` every 10 seconds while status is `"processing"`.
