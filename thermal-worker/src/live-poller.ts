// Live thermal polling loop. Replaces the poll-lock / fetch / detect
// pipeline that used to live inside GET /api/live/thermals.
//
// Every POLL_INTERVAL_MS, fetches new tracker positions since the
// stored cursor, persists them, runs live-thermal detection, purges
// old data, and publishes the latest tracker status to live-state so
// the read route can surface it to the client.

import { prisma } from "./db.ts";
import { fetchTrackerPositions } from "./lib/tracker-client.ts";
import { detectLiveThermals } from "./lib/live-thermal-detector.ts";
import { setTrackerStatus } from "./live-state.ts";

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const PURGE_AGE_HOURS = 24;
const EARLIEST_HOUR_UTC = 9; // 10:00 BST = 09:00 UTC

/**
 * Returns the effective "since" timestamp — the later of the stored cursor
 * and 10:00 BST (09:00 UTC) today. Prevents pointless catch-up of pre-soaring
 * hours and caps the backlog on first poll of the day.
 */
function effectiveSince(storedTs: Date): Date {
  const todayFloor = new Date();
  todayFloor.setUTCHours(EARLIEST_HOUR_UTC, 0, 0, 0);
  return storedTs > todayFloor ? storedTs : todayFloor;
}

async function getOrCreatePollState(): Promise<{ lastPositionTs: Date }> {
  const existing = await prisma.pollState.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  const now = new Date();
  return prisma.pollState.create({
    data: { id: 1, lastPollAt: new Date(0), lastPositionTs: now },
  });
}

async function runPollCycle(): Promise<void> {
  try {
    const state = await getOrCreatePollState();
    const cursor = effectiveSince(state.lastPositionTs);

    const result = await fetchTrackerPositions(cursor);
    setTrackerStatus(result.trackerStatus);

    if (result.positions.length > 0) {
      await prisma.livePosition.createMany({
        data: result.positions.map((p) => ({
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

      // Advance cursor to the latest position timestamp.
      const lastTs = new Date(
        result.positions[result.positions.length - 1].ts,
      );
      await prisma.pollState.update({
        where: { id: 1 },
        data: { lastPositionTs: lastTs, lastPollAt: new Date() },
      });
    } else {
      // Still bump lastPollAt so we can observe a healthy heartbeat.
      await prisma.pollState.update({
        where: { id: 1 },
        data: { lastPollAt: new Date() },
      });
    }

    const newThermals = await detectLiveThermals();

    // Opportunistic purge of old positions.
    const purgeThreshold = new Date(
      Date.now() - PURGE_AGE_HOURS * 60 * 60 * 1000,
    );
    prisma.livePosition
      .deleteMany({ where: { fetchedAt: { lt: purgeThreshold } } })
      .catch((err: unknown) =>
        console.error("[live-poller] position purge failed:", err),
      );

    if (result.positions.length > 0 || newThermals > 0) {
      console.log(
        `[live-poller] fetched=${result.positions.length} newThermals=${newThermals} status=${result.trackerStatus}`,
      );
    }
  } catch (error) {
    console.error("[live-poller] cycle failed:", error);
    setTrackerStatus("error");
  }
}

export function startLivePoller(): void {
  console.log(
    `[live-poller] starting, poll interval ${POLL_INTERVAL_MS / 1000}s`,
  );
  void runPollCycle();
  setInterval(() => void runPollCycle(), POLL_INTERVAL_MS).unref();
}
