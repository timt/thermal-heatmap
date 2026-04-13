@AGENTS.md

# Thermal Heatmap

UK thermal heatmap for glider pilots, showing thermals detected from BGA Ladder and WeGlide flight data plus live OGN tracker positions.

## Architecture

```
Cloudflare Pages (thermal.gliderzone.com)      → Vite SPA (read-only UI)
Fly.io worker   (api.thermal.gliderzone.com)   → Hono API + background processing
Supabase                                        → PostgreSQL (shared)
```

The UI is a static SPA that reads cached data from the worker API. The worker fetches flights from BGA/WeGlide, detects thermals, and polls live tracker positions — all on background timers. The client never triggers processing.

## Tech Stack

- **Frontend:** Vite + React 19, Tailwind CSS v4, Leaflet
- **Worker:** Hono + Node.js (tsx runtime), Prisma v7 adapter pattern
- **ORM:** Prisma v7 (shared schema at repo root, generated into `thermal-worker/`)
- **Database:** PostgreSQL (Docker locally, Supabase in production)
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
  src/routes/                 5 GET routes (thermals, flights, processed-dates,
                              activity-calendar, live/thermals)
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

The worker also needs `DATABASE_URL` and `TRACKER_API_KEY` set as Fly.io secrets.

To run migrations against production manually:
```bash
DATABASE_URL="<supabase-pooler-url>" npx prisma migrate deploy
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

## Supabase Gotchas

- Direct connection (`db.<ref>.supabase.co:5432`) does not resolve for newer projects.
- Use the **session pooler** instead: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
- URL-encode passwords containing special characters (`*` → `%2A`, `!` → `%21`).

## Conventions

- No auth, no tests, no error boundaries — this is a proof of concept.
- The worker processes BGA + WeGlide for today and yesterday every 15 minutes.
- Live thermals poll the tracker API every 30 seconds.
- The SPA polls `/thermals` every 10 seconds while status is `"processing"`.
