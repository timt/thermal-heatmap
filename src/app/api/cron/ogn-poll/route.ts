import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchLivePositions } from "@/lib/ogn-client";
import { refreshDdbIfStale, getUntrackedDeviceIds } from "@/lib/ogn-ddb";
import { detectLiveThermals } from "@/lib/live-thermal-detector";

const PURGE_AGE_HOURS = 24;

/**
 * Cron entry-point for continuous OGN polling. Vercel hits this on a
 * schedule (configured in vercel.json) so that LivePosition data is
 * collected throughout the day, independent of user visits.
 *
 * Authenticated via Vercel's automatic CRON_SECRET bearer header.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await refreshDdbIfStale();

    const positions = await fetchLivePositions();
    let stored = 0;

    if (positions.length > 0) {
      const untrackedIds = await getUntrackedDeviceIds();
      const trackable = positions.filter((p) => !untrackedIds.has(p.deviceId));

      if (trackable.length > 0) {
        const result = await prisma.livePosition.createMany({
          data: trackable.map((p) => ({
            deviceId: p.deviceId,
            callsign: p.callsign,
            registration: p.registration,
            lat: p.lat,
            lon: p.lon,
            altMetres: p.altMetres,
            heading: p.heading,
            speedKmh: p.speedKmh,
            climbRateMs: p.climbRateMs,
            aircraftType: p.aircraftType,
            receiver: p.receiver,
            icaoHex: p.icaoHex,
            timestamp: p.timestamp,
          })),
          skipDuplicates: true,
        });
        stored = result.count;
      }
    }

    const newThermals = await detectLiveThermals();

    // Purge old positions
    const purgeThreshold = new Date(Date.now() - PURGE_AGE_HOURS * 60 * 60 * 1000);
    const purged = await prisma.livePosition.deleteMany({
      where: { fetchedAt: { lt: purgeThreshold } },
    });

    return Response.json({
      ok: true,
      fetched: positions.length,
      stored,
      newThermals,
      purged: purged.count,
    });
  } catch (error) {
    console.error("OGN cron poll failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
