import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchTrackerPositions } from "@/lib/tracker-client";
import { detectLiveThermals } from "@/lib/live-thermal-detector";
import type { LiveThermalResponse } from "@/lib/types";

const STALE_THRESHOLD_MS = 30_000;
const DEFAULT_MAX_AGE_SECONDS = 3600;
const PURGE_AGE_HOURS = 24;
const EARLIEST_HOUR_UTC = 9; // 10:00 BST = 09:00 UTC

/**
 * Returns the effective "since" timestamp — the later of the stored cursor
 * and 10:00 BST (09:00 UTC) today. Prevents pointless catch-up of pre-soaring
 * hours and caps the backlog on first visit of the day.
 */
function effectiveSince(storedTs: Date): Date {
  const todayFloor = new Date();
  todayFloor.setUTCHours(EARLIEST_HOUR_UTC, 0, 0, 0);
  return storedTs > todayFloor ? storedTs : todayFloor;
}

/**
 * Ensures the PollState row exists, creating it with a sensible default
 * if this is the first ever poll.
 */
async function getOrCreatePollState() {
  const existing = await prisma.pollState.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  const now = new Date();
  return prisma.pollState.create({
    data: { id: 1, lastPollAt: new Date(0), lastPositionTs: now },
  });
}

/**
 * Attempt to acquire the poll lock using an optimistic DB update.
 * Returns the cursor timestamp if we won the lock, or null if another
 * request is already polling.
 */
async function tryAcquirePollLock(): Promise<Date | null> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const updated = await prisma.pollState.updateMany({
    where: { id: 1, lastPollAt: { lt: staleThreshold } },
    data: { lastPollAt: new Date() },
  });

  if (updated.count === 0) return null;

  const state = await prisma.pollState.findUnique({ where: { id: 1 } });
  return state ? effectiveSince(state.lastPositionTs) : null;
}

/**
 * Demand-driven live thermals endpoint. Each request checks whether the
 * cache is stale and, if so, fetches new positions from the tracker API,
 * runs thermal detection, and updates the shared cache. Concurrent requests
 * return the existing cache without duplicating work.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const maxAgeSeconds = parseInt(
    searchParams.get("max_age") ?? String(DEFAULT_MAX_AGE_SECONDS),
    10,
  );
  const minClimb = parseFloat(searchParams.get("min_climb") ?? "0");

  if (isNaN(maxAgeSeconds) || maxAgeSeconds < 0) {
    return Response.json(
      { error: "Invalid 'max_age' parameter. Must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    await getOrCreatePollState();

    // Try to acquire the poll lock — only one request does the fetch
    let newThermals = 0;
    let fetched = 0;

    const cursor = await tryAcquirePollLock();
    if (cursor) {
      const positions = await fetchTrackerPositions(cursor);
      fetched = positions.length;

      if (positions.length > 0) {
        await prisma.livePosition.createMany({
          data: positions.map((p) => ({
            deviceId: p.deviceId,
            registration: p.registration,
            model: p.model,
            lat: p.lat,
            lon: p.lon,
            altMetres: p.altM,
            groundKt: p.groundKt,
            climbRateMs: p.climbMs,
            aircraftType: p.aircraftType,
            timestamp: new Date(p.ts),
          })),
          skipDuplicates: true,
        });

        // Advance cursor to the latest position timestamp
        const lastTs = new Date(positions[positions.length - 1].ts);
        await prisma.pollState.update({
          where: { id: 1 },
          data: { lastPositionTs: lastTs },
        });
      }

      newThermals = await detectLiveThermals();

      // Opportunistic purge of old data
      const purgeThreshold = new Date(Date.now() - PURGE_AGE_HOURS * 60 * 60 * 1000);
      prisma.livePosition
        .deleteMany({ where: { fetchedAt: { lt: purgeThreshold } } })
        .catch((err: unknown) => console.error("Position purge failed:", err));
    }

    // Return cached thermals regardless of whether we polled
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

    return Response.json({
      thermals: result,
      count: result.length,
      newThermals,
      fetched,
      maxAgeSeconds,
    });
  } catch (error) {
    console.error("Live thermals error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
