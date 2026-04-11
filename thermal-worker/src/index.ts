// thermal-heatmap worker: HTTP API + background processing loops.
//
// GLI-100 scope: scaffold only — Hono app with CORS and /healthz.
// Routes, processor and live poller land in GLI-102 / GLI-103 / GLI-104.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

const PORT = Number(process.env.PORT ?? 8080);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "https://thermal.gliderzone.com",
      "http://localhost:5173", // Vite dev
    ],
  }),
);

app.get("/healthz", (c) =>
  c.json({ ok: true, service: "thermal-worker" }),
);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
});
