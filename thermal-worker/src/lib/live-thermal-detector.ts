import { prisma } from "../db.ts";
import { detectThermals } from "./thermal-detector.ts";
import type { TrackPoint, ThermalDetectionParams } from "./types.ts";

const TRACK_WINDOW_MINUTES = 30;
const MIN_POINTS_PER_DEVICE = 5;
const PURGE_AGE_HOURS = 24;

/** Tuned for sparse OGN data (~30s intervals, already one point per poll) */
const LIVE_DETECTION_PARAMS: Partial<ThermalDetectionParams> = {
  sampleRate: 1,
  windowSize: 5,
  minClimbRate: 0.5,
  minAltGain: 30,
  minHeadingChange: 180,
  extensionClimbFactor: 0.3,
};

export async function detectLiveThermals(): Promise<number> {
  const since = new Date(Date.now() - TRACK_WINDOW_MINUTES * 60 * 1000);

  // Fetch recent positions (already filtered to gliders at ingestion)
  const positions = await prisma.livePosition.findMany({
    where: {
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "asc" },
    select: {
      deviceId: true,
      lat: true,
      lon: true,
      altMetres: true,
      timestamp: true,
    },
  });

  // Group by device
  const byDevice = new Map<string, TrackPoint[]>();
  for (const p of positions) {
    const track = byDevice.get(p.deviceId) ?? [];
    track.push({
      lat: p.lat,
      lon: p.lon,
      alt: p.altMetres,
      time: Math.floor(p.timestamp.getTime() / 1000),
    });
    byDevice.set(p.deviceId, track);
  }

  // Detect thermals per device
  let totalNew = 0;

  for (const [deviceId, track] of byDevice) {
    if (track.length < MIN_POINTS_PER_DEVICE) continue;

    const detected = detectThermals(track, LIVE_DETECTION_PARAMS);
    if (detected.length === 0) continue;

    const result = await prisma.liveThermal.createMany({
      data: detected.map((t) => ({
        deviceId,
        lat: t.lat,
        lon: t.lon,
        avgClimbRate: t.avgClimbRate,
        altGain: t.altGain,
        baseAlt: t.baseAlt,
        topAlt: t.topAlt,
        entryTime: new Date(t.entryTime * 1000),
        exitTime: new Date(t.exitTime * 1000),
      })),
      skipDuplicates: true,
    });

    totalNew += result.count;
  }

  // Opportunistic purge
  const purgeThreshold = new Date(Date.now() - PURGE_AGE_HOURS * 60 * 60 * 1000);
  prisma.liveThermal
    .deleteMany({ where: { detectedAt: { lt: purgeThreshold } } })
    .catch((err: unknown) => console.error("Live thermal purge failed:", err));

  return totalNew;
}
