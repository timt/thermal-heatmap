import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchLivePositions } from "@/lib/ogn-client";
import {
  refreshDdbIfStale,
  getUntrackedDeviceIds,
  getUnidentifiedDeviceIds,
} from "@/lib/ogn-ddb";
import type { LiveGliderPosition } from "@/lib/types";

const MIN_FETCH_INTERVAL_MS = 10_000;
const PURGE_AGE_HOURS = 24;
const DEFAULT_MAX_AGE_SECONDS = 120;

let lastFetchTime = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const maxAgeSeconds = parseInt(
    searchParams.get("max_age") ?? String(DEFAULT_MAX_AGE_SECONDS),
    10,
  );

  if (isNaN(maxAgeSeconds) || maxAgeSeconds < 0) {
    return Response.json(
      { error: "Invalid 'max_age' parameter. Must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    const now = Date.now();

    // Only fetch from OGN if enough time has passed since last fetch
    if (now - lastFetchTime >= MIN_FETCH_INTERVAL_MS) {
      lastFetchTime = now;

      // Refresh DDB cache if stale (fire-and-forget style, but awaited to
      // ensure untracked device filtering is up to date on first request)
      await refreshDdbIfStale();

      const positions = await fetchLivePositions();

      if (positions.length > 0) {
        // Filter out devices that have opted out of tracking
        const untrackedIds = await getUntrackedDeviceIds();
        const trackablePositions = positions.filter(
          (p) => !untrackedIds.has(p.deviceId),
        );

        if (trackablePositions.length > 0) {
          await prisma.livePosition.createMany({
            data: trackablePositions.map((p) => ({
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
        }
      }

      // Opportunistic purge of old positions
      const purgeThreshold = new Date(now - PURGE_AGE_HOURS * 60 * 60 * 1000);
      prisma.livePosition
        .deleteMany({ where: { fetchedAt: { lt: purgeThreshold } } })
        .catch((err: unknown) => console.error("Purge failed:", err));
    }

    // Read current positions from DB
    const since = new Date(Date.now() - maxAgeSeconds * 1000);
    const dbPositions = await prisma.livePosition.findMany({
      where: {
        timestamp: { gte: since },
        aircraftType: 0,
      },
      orderBy: { timestamp: "desc" },
    });

    // Apply privacy: null out registration for unidentified devices
    const unidentifiedIds = await getUnidentifiedDeviceIds();

    const result: readonly LiveGliderPosition[] = dbPositions.map((p) => ({
      deviceId: p.deviceId,
      callsign: p.callsign,
      registration: unidentifiedIds.has(p.deviceId) ? null : p.registration,
      lat: p.lat,
      lon: p.lon,
      altMetres: p.altMetres,
      heading: p.heading,
      speedKmh: p.speedKmh,
      climbRateMs: p.climbRateMs,
      timestamp: p.timestamp.toISOString(),
      receiver: p.receiver,
    }));

    return Response.json({
      positions: result,
      count: result.length,
      maxAgeSeconds,
    });
  } catch (error) {
    console.error("Error fetching OGN positions:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
