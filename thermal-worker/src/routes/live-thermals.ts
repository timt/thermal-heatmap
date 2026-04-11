import { Hono } from "hono";
import { prisma } from "../db.ts";
import type { LiveThermalResponse } from "../lib/types.ts";
import { getTrackerStatus } from "../live-state.ts";

const DEFAULT_MAX_AGE_SECONDS = 3600;

export const liveThermalsRoute = new Hono();

/**
 * Pure DB read. The worker's live-poller fetches + detects on its own
 * timer (GLI-104), so this route no longer needs poll-lock semantics.
 */
liveThermalsRoute.get("/live/thermals", async (c) => {
  const maxAgeRaw = c.req.query("max_age") ?? String(DEFAULT_MAX_AGE_SECONDS);
  const minClimbRaw = c.req.query("min_climb") ?? "0";

  const maxAgeSeconds = parseInt(maxAgeRaw, 10);
  const minClimb = parseFloat(minClimbRaw);

  if (isNaN(maxAgeSeconds) || maxAgeSeconds < 0) {
    return c.json(
      { error: "Invalid 'max_age' parameter. Must be a non-negative integer" },
      400,
    );
  }

  try {
    const since = new Date(Date.now() - maxAgeSeconds * 1000);
    const thermals = await prisma.liveThermal.findMany({
      where: {
        exitTime: { gte: since },
        ...(minClimb > 0 ? { avgClimbRate: { gte: minClimb } } : {}),
      },
      orderBy: { exitTime: "desc" },
    });

    const result: readonly LiveThermalResponse[] = thermals.map((t) => ({
      deviceId: t.deviceId,
      lat: t.lat,
      lon: t.lon,
      avgClimbRate: t.avgClimbRate,
      altGain: t.altGain,
      baseAlt: t.baseAlt,
      topAlt: t.topAlt,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime.toISOString(),
      detectedAt: t.detectedAt.toISOString(),
    }));

    return c.json({
      thermals: result,
      count: result.length,
      maxAgeSeconds,
      trackerStatus: getTrackerStatus(),
    });
  } catch (error) {
    console.error("Live thermals error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
