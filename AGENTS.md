# Thermal heatmap project conventions

This project **follows the shared gliding stack** — see [`../TECH-STACK.md`](../TECH-STACK.md) for Vite/React 19, Hono/Fly.io, Prisma v7/Neon, and the cross-project conventions (British spelling, Linear, trunk-based). External data sources (WeGlide, BGA Ladder, OpenTopoMap) are indexed in [`../DATA-SOURCES.md`](../DATA-SOURCES.md). Architecture and dev workflow are in `CLAUDE.md`.

The database is the logical DB `thermal` (role `thermal_owner`) **inside the shared `gliderzone-continuous` Neon project** (`damp-fire-29117629`) — see `CLAUDE.md` § Neon Notes and `../TECH-STACK.md` § Database for the two-bucket topology and restore runbook.

## Authentication (GLI-203)

First app onto the shared auth platform (`auth.gliderzone.com`, Auth project).

- **Web** consumes `@gliderzone/auth-client` (published on npm). `web/src/lib/authClient.ts` builds the client (override the auth URL locally with `VITE_AUTH_URL`); `AccountControl` is the sign-in/out + "signed in as…" widget.
- **Worker** verifies JWTs locally against the auth JWKS — `thermal-worker/src/auth.ts` (`requireUser`), no callback into auth. `GET /me` is the first gated route. Claim contract is pinned by the auth service (GLI-171); don't widen reliance here.
- **CORS/CSRF**: the worker allows the `Authorization` header (no cookies cross to it — the SSO cookie is auth's). The auth service must list `https://thermal.gliderzone.com` in `TRUSTED_ORIGINS`.
- No new worker secrets — `AUTH_BASE_URL` defaults to `https://auth.gliderzone.com`.

## Deviations from the shared stack

- **Layout**: the web app lives in `web/` (with its own `package.json`), not root-level `src/`; the backend is `thermal-worker/`.
- **Realtime**: the SPA polls the worker API rather than using SSE. Data is batch-processed on background timers (15 min), so there is no live event stream to push.
