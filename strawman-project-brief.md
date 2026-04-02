# Strawman Full-Stack Project Brief

## Objective

Build a minimal proof-of-concept web application that validates the full development-to-deployment lifecycle. The app should demonstrate: a web UI with CRUD operations backed by a database, a server-side call to an external API, and working deployments both locally and to production.

This document is intended as a handoff brief for Claude Code.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js (App Router) | Full-stack React framework |
| Language | TypeScript | Type safety throughout |
| ORM | Prisma | Database schema, migrations, queries |
| Database (local) | PostgreSQL via Docker | Local development (user already runs this) |
| Database (prod) | Supabase (free tier) | Managed Postgres for production |
| External API | Open-Meteo Weather API | Free, no auth required, demonstrates server-side API calls |
| Deployment | Vercel (free Hobby tier) | Production hosting, auto-deploys from GitHub |
| Version Control | GitHub | Source control + Vercel integration |

---

## What to Build

A simple "Weather Bookmarks" app. The user can:

1. **Create** a bookmark by entering a city name (stored in the database)
2. **Read** a list of all saved city bookmarks
3. **Update** a bookmark (e.g. rename a city)
4. **Delete** a bookmark
5. **View live weather** for any bookmarked city (fetched server-side from Open-Meteo API)

This is deliberately minimal — the goal is to prove the architecture, not build a real product.

---

## Step-by-Step Roadmap

### Phase 1: Project Scaffolding

1. Initialise a new Next.js project with TypeScript and the App Router:
   ```bash
   npx create-next-app@latest weather-bookmarks --typescript --app --tailwind --eslint --src-dir --import-alias "@/*"
   ```
2. Initialise a git repository and create a GitHub remote.
3. Install Prisma:
   ```bash
   npm install prisma --save-dev
   npm install @prisma/client
   npx prisma init
   ```

### Phase 2: Database Schema and Local Setup

1. Define the Prisma schema in `prisma/schema.prisma`:
   ```prisma
   generator client {
     provider = "prisma-client-js"
   }

   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   model City {
     id        Int      @id @default(autoincrement())
     name      String
     latitude  Float?
     longitude Float?
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
   }
   ```
2. Configure `.env` with the local Docker Postgres connection string:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/weather_bookmarks?schema=public"
   ```
   Adjust credentials/port to match the user's existing Docker Postgres setup.
3. Create the local database and run the initial migration:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Verify with Prisma Studio:
   ```bash
   npx prisma studio
   ```

### Phase 3: Backend — API Routes

Create Next.js API route handlers under `src/app/api/cities/`:

1. **`GET /api/cities`** — Return all cities from the database.
2. **`POST /api/cities`** — Create a new city bookmark. Accept `{ name }` in the request body. Use a geocoding lookup (Open-Meteo has a free geocoding API at `https://geocoding-api.open-meteo.com/v1/search?name={city}`) to resolve and store latitude/longitude.
3. **`PUT /api/cities/[id]`** — Update a city's name (and re-geocode).
4. **`DELETE /api/cities/[id]`** — Delete a city bookmark.

Create a separate route for weather data:

5. **`GET /api/weather/[id]`** — Look up the city by ID, then call the Open-Meteo forecast API:
   ```
   https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true
   ```
   Return the current weather data to the client.

Important implementation notes:
- Create a shared Prisma client instance (e.g. `src/lib/prisma.ts`) following the Next.js singleton pattern.
- All external API calls happen server-side only (in route handlers), never from the client.
- Use proper error handling and return appropriate HTTP status codes.

### Phase 4: Frontend — Web UI

Build a simple single-page UI at `src/app/page.tsx`:

1. A form to add a new city (text input + submit button).
2. A list of bookmarked cities, each showing:
   - City name
   - A "View Weather" button that fetches and displays current temperature and conditions
   - An "Edit" button that allows renaming
   - A "Delete" button
3. Keep styling minimal — Tailwind utility classes are fine. The goal is functional, not pretty.

Use React Server Components where sensible, and Client Components (with `"use client"`) for interactive elements.

### Phase 5: Local Verification

1. Start the Next.js dev server:
   ```bash
   npm run dev
   ```
2. Verify all CRUD operations work against the local Docker Postgres.
3. Verify weather data is fetched and displayed correctly.
4. Run a production build locally to catch any build errors:
   ```bash
   npm run build && npm start
   ```

### Phase 6: Production Database Setup (Supabase)

1. Create a Supabase project (free tier) via the Supabase dashboard (this is the one manual step — needs the user to do it at https://supabase.com).
2. Retrieve the database connection string from Supabase dashboard under Settings > Database > Connection string (URI).
3. The connection string will look like:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

### Phase 7: Production Deployment (Vercel)

1. Push the project to GitHub.
2. Connect the GitHub repo to Vercel (first time requires the Vercel dashboard, or use the Vercel CLI):
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```
3. Set the production environment variable in Vercel:
   ```bash
   vercel env add DATABASE_URL production
   ```
   Paste the Supabase connection string when prompted.
4. Also set a `DIRECT_URL` environment variable if using Supabase connection pooling (Prisma needs this for migrations).
5. Add a `postinstall` script in `package.json` to generate the Prisma client on Vercel:
   ```json
   "scripts": {
     "postinstall": "prisma generate"
   }
   ```
6. Deploy:
   ```bash
   vercel --prod
   ```
7. Run the Prisma migration against the production database:
   ```bash
   DATABASE_URL="<supabase-connection-string>" npx prisma migrate deploy
   ```

### Phase 8: End-to-End Verification

1. Open the Vercel production URL in a browser.
2. Add a city, verify it appears in the list.
3. Fetch weather for the city, verify data displays.
4. Edit and delete a city, verify changes persist.
5. Check the Supabase dashboard to confirm data is in the production database.
6. Make a small code change locally, commit, push to GitHub, and verify Vercel auto-deploys the update.

---

## Environment Variables Summary

| Variable | Local (.env) | Production (Vercel) |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/weather_bookmarks` | Supabase connection string |

---

## File Structure (Expected)

```
weather-bookmarks/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cities/
│   │   │   │   ├── route.ts          (GET all, POST new)
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      (PUT, DELETE)
│   │   │   └── weather/
│   │   │       └── [id]/
│   │   │           └── route.ts      (GET weather)
│   │   ├── layout.tsx
│   │   └── page.tsx                   (Main UI)
│   └── lib/
│       └── prisma.ts                  (Prisma client singleton)
├── .env                               (local, git-ignored)
├── .gitignore
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

---

## Notes for Claude Code

- The user already runs Docker Postgres locally. Ask them for their connection details (port, username, password) before configuring `.env`.
- Do NOT commit `.env` files. Ensure `.gitignore` includes `.env*`.
- The Open-Meteo API requires no API key — it's completely free and open.
- Keep everything as simple as possible. This is a proof of concept, not production-grade code. Skip auth, skip error boundaries, skip tests for now.
- When in doubt, favour fewer files and less abstraction.
- After the strawman is verified end-to-end, the user will repurpose this scaffolding for their actual project.
