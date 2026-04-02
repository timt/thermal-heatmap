# Thermal Heatmap — Progress

## Status: Complete ✓

## Phases

- [x] Phase 1: Project scaffolding (Next.js, git, GitHub, Docker Compose, Prisma)
- [x] Phase 2: Database schema and local setup (Prisma v7, City model, migration applied)
- [x] Phase 3: Backend API routes (CRUD cities + geocoding, weather endpoint)
- [x] Phase 4: Frontend UI (single-page Weather Bookmarks app with Tailwind)
- [x] Phase 5: Local verification (all endpoints tested, production build passes)
- [x] Phase 6: Production database (Supabase, eu-west-1, migration applied)
- [x] Phase 7: Production deployment (Vercel, all endpoints verified)

## URLs
- **Production:** https://thermal-heatmap.vercel.app
- **GitHub:** https://github.com/timt/thermal-heatmap
- **Vercel dashboard:** https://vercel.com/ttennant-4147s-projects/thermal-heatmap

## Key Decisions
- Local Postgres via Docker Compose on port 5444, container: thermal-heatmap-db
- Prisma v7 with adapter pattern (@prisma/adapter-pg + pg Pool)
- Next.js 16.2.2 with Turbopack, App Router, Tailwind v4
- Supabase session pooler connection (aws-0-eu-west-1.pooler.supabase.com:5432)
- Open-Meteo API for geocoding and weather (no auth needed)

## Tech Notes
- Prisma v7 removed `url` from schema.prisma — connection configured in prisma.config.ts
- Prisma v7 uses adapter pattern: PrismaClient({ adapter: new PrismaPg(pool) })
- Generated client at src/generated/prisma (gitignored, rebuilt via postinstall)
- serverExternalPackages in next.config.ts for @prisma/adapter-pg and pg
- Supabase direct connection (db.*.supabase.co) doesn't resolve — use pooler endpoint

## Local Development
```bash
docker compose up -d          # Start local Postgres on port 5444
npm run dev                   # Start Next.js dev server on port 3000
npx prisma migrate dev        # Run migrations locally
npx prisma studio             # Browse local DB
```
