// thermal-heatmap worker: HTTP API + background processing loops.
//
// HTTP routes expose cached thermal/flight data to the Vite SPA. The
// background processor (GLI-103) and live poller (GLI-104) keep that
// cache fresh on their own timers — the client never triggers fetches.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { thermalsRoute } from "./routes/thermals.ts";
import { processedDatesRoute } from "./routes/processed-dates.ts";
import { flightsRoute } from "./routes/flights.ts";
import { activityCalendarRoute } from "./routes/activity-calendar.ts";
import { liveThermalsRoute } from "./routes/live-thermals.ts";
import { startProcessor } from "./processor.ts";

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

app.route("/", thermalsRoute);
app.route("/", processedDatesRoute);
app.route("/", flightsRoute);
app.route("/", activityCalendarRoute);
app.route("/", liveThermalsRoute);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
});

startProcessor();
