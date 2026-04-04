@AGENTS.md

# Thermal Heatmap

Weather Bookmarks proof-of-concept — scaffolding for a full-stack Next.js app with the intent to repurpose for a real project.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **ORM:** Prisma v7 (adapter pattern — see gotchas below)
- **Database:** PostgreSQL (Docker locally, Supabase in production)
- **Styling:** Tailwind CSS v4
- **Deployment:** Vercel (auto-deployed via GitHub Action on push to main)
- **External API:** Open-Meteo (geocoding + weather, no auth required)

## Local Development

```bash
docker compose up -d          # Postgres on port 5444
npm run dev                   # Next.js on port 3000
npx prisma migrate dev        # Apply migrations
npx prisma studio             # Browse DB
```

Local DB connection: `postgresql://postgres:postgres@localhost:5444/thermal_heatmap`

## Deployment

Production is on Vercel with Supabase Postgres (eu-west-1). Custom domain: `thermal.gliderzone.com`.

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs Prisma migrations and deploys to Vercel. The workflow only triggers on changes to `src/`, `prisma/`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, or `.github/workflows/`. For config-only changes (e.g. `vercel.json`), deploy manually:

```bash
npx vercel --prod             # Manual deploy to production
```

To run migrations against production manually:
```bash
DATABASE_URL="<supabase-pooler-url>" npx prisma migrate deploy
```

The `postinstall` script in package.json runs `prisma generate` automatically on Vercel builds.

## Project Structure

- `src/app/page.tsx` — Single-page client component (all UI)
- `src/app/api/cities/route.ts` — GET all, POST new (with geocoding)
- `src/app/api/cities/[id]/route.ts` — PUT (re-geocodes), DELETE
- `src/app/api/weather/[id]/route.ts` — GET current weather for a city
- `src/lib/prisma.ts` — Prisma client singleton (adapter pattern)
- `prisma/schema.prisma` — Schema (no `url` in datasource — see below)
- `prisma.config.ts` — Database URL configured here, not in schema
- `docker-compose.yml` — Local Postgres on port 5444

## Prisma v7 Gotchas

This project uses Prisma v7 which has breaking changes from v6 and earlier:

1. **No `url` in schema.prisma** — Connection URL goes in `prisma.config.ts` only. Adding `url = env("DATABASE_URL")` to the datasource block causes a validation error.
2. **Adapter pattern for client** — The client requires an explicit adapter:
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
   new PrismaClient({ adapter });
   ```
3. **Generated client location** — Output is `src/generated/prisma` (gitignored). Import from `@/generated/prisma/client`.
4. **Provider is `prisma-client`** not `prisma-client-js`.
5. **`@prisma/adapter-pg`** is the correct package (not `@prisma/pg-worker` which is v6).
6. **`serverExternalPackages`** — `@prisma/adapter-pg` and `pg` must be listed in `next.config.ts` to avoid Turbopack bundling issues.

## Supabase Gotchas

- Direct connection (`db.<ref>.supabase.co:5432`) does not resolve for newer projects.
- Use the **session pooler** instead: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
- URL-encode passwords containing special characters (`*` → `%2A`, `!` → `%21`).

## Conventions

- Route handler params are `Promise<{ id: string }>` in Next.js 16 — must `await params` then convert `id` to `Number()` for Prisma int PKs.
- All external API calls are server-side only (in route handlers).
- No auth, no tests, no error boundaries — this is a proof of concept.
