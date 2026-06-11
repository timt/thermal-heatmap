# Thermal heatmap project conventions

This project **follows the shared gliding stack** — see [`../TECH-STACK.md`](../TECH-STACK.md) for Vite/React 19, Hono/Fly.io, Prisma v7/Neon, and the cross-project conventions (British spelling, Linear, trunk-based). External data sources (WeGlide, BGA Ladder, OpenTopoMap) are indexed in [`../DATA-SOURCES.md`](../DATA-SOURCES.md). Architecture and dev workflow are in `CLAUDE.md`.

## Deviations from the shared stack

- **Layout**: the web app lives in `web/` (with its own `package.json`), not root-level `src/`; the backend is `thermal-worker/`.
- **Realtime**: the SPA polls the worker API rather than using SSE. Data is batch-processed on background timers (15 min), so there is no live event stream to push.
