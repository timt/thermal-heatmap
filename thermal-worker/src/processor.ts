// Background thermal processing loop. Replaces the old client-driven
// batch orchestration (/api/thermals/process, /check, /heal, freshness.ts).
//
// On startup and every CYCLE_MS milliseconds, this loop iterates over
// (source × {today, yesterday}) and:
//   1. Fetches the current flight list from the provider
//   2. Upserts flights under a ProcessedDate (creating the record if new)
//   3. If the provider's flight count exceeds what we've cached, wipes
//      the stale cache for that date so it can be rebuilt
//   4. Processes any unprocessed flights (track fetch + thermal detection)
//   5. Heals stuck flights (hasTrackData but zero thermals)
//   6. Updates the ProcessedDate thermalCount + algorithmVersion
//
// No timeouts, no batching, no abort controllers — the worker just runs
// until everything is done.

import { prisma } from "./db.ts";
import {
  VALID_SOURCES,
  getProvider,
  fetchFlightDetailsForSource,
  type Source,
} from "./lib/provider-factory.ts";
import { detectThermals, ALGORITHM_VERSION } from "./lib/thermal-detector.ts";
import type { FlightSourceProvider } from "./lib/types.ts";

const CYCLE_MS = 15 * 60 * 1000; // 15 minutes

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgoUtc(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

async function ensureFlightsCached(
  source: Source,
  dateStr: string,
  provider: FlightSourceProvider,
): Promise<void> {
  const dateObj = new Date(`${dateStr}T00:00:00Z`);

  const providerIds = await provider.getFlightIds(dateStr);
  const cachedCount = await prisma.flight.count({
    where: { source, date: dateObj },
  });

  // Cache hit with matching count → nothing to fetch.
  if (providerIds.length > 0 && cachedCount === providerIds.length) {
    return;
  }

  // Stale cache (provider has more flights than we do) → wipe this date
  // so the new list replaces it. Mirrors what /api/thermals/check used
  // to do on the client's behalf.
  if (cachedCount > 0 && providerIds.length > cachedCount) {
    const stale = await prisma.processedDate.findFirst({
      where: { source, date: dateObj },
    });
    if (stale) {
      await prisma.thermal.deleteMany({
        where: { flight: { processedDateId: stale.id } },
      });
      await prisma.flight.deleteMany({
        where: { processedDateId: stale.id },
      });
      await prisma.processedDate.delete({ where: { id: stale.id } });
    }
  }

  if (providerIds.length === 0) {
    // Nothing to process for this date.
    return;
  }

  const flights = await fetchFlightDetailsForSource(provider, providerIds);

  const processedDate = await prisma.processedDate.upsert({
    where: { source_date: { source, date: dateObj } },
    create: {
      source,
      date: dateObj,
      flightCount: flights.length,
      thermalCount: 0,
      algorithmVersion: "none",
      lastCheckedAt: new Date(),
    },
    update: {
      flightCount: flights.length,
      lastCheckedAt: new Date(),
    },
  });

  await Promise.all(
    flights.map((f) =>
      prisma.flight.upsert({
        where: { sourceId: f.id },
        create: {
          sourceId: f.id,
          source: f.source,
          date: dateObj,
          pilot: f.pilot,
          club: f.club,
          aircraft: f.aircraft,
          registration: f.registration,
          launchSite: f.launchSite,
          region: f.region,
          launchLat: f.launchLat,
          launchLon: f.launchLon,
          distance: f.distance,
          speed: f.speed,
          points: f.points,
          sourceUrl: f.sourceUrl,
          hasTrackData: f.hasTrackData,
          processedDateId: processedDate.id,
        },
        update: { processedDateId: processedDate.id },
      }),
    ),
  );
}

async function processUnprocessedFlights(
  source: Source,
  dateStr: string,
  provider: FlightSourceProvider,
): Promise<{ processed: number; thermals: number }> {
  const dateObj = new Date(`${dateStr}T00:00:00Z`);

  const unprocessed = await prisma.flight.findMany({
    where: { source, date: dateObj, processed: false },
    select: { id: true, sourceId: true, hasTrackData: true },
  });

  let processed = 0;
  let thermalCount = 0;

  for (const flight of unprocessed) {
    if (!flight.hasTrackData) {
      // No track to fetch — flag as processed so we don't keep checking.
      await prisma.flight.update({
        where: { id: flight.id },
        data: { processed: true },
      });
      processed++;
      continue;
    }

    const rawId = flight.sourceId.replace(`${source}:`, "");
    const trackResult = await provider.getTrackPoints(rawId);

    if (trackResult.status === "failed") {
      // Leave `processed` false so we retry on the next cycle.
      console.warn(
        `[processor] track fetch failed ${flight.sourceId}: ${trackResult.reason}`,
      );
      continue;
    }

    if (trackResult.points.length === 0) {
      await prisma.flight.update({
        where: { id: flight.id },
        data: { processed: true },
      });
      processed++;
      continue;
    }

    const detected = detectThermals(trackResult.points);

    if (detected.length > 0) {
      await prisma.thermal.createMany({
        data: detected.map((t) => ({
          lat: t.lat,
          lon: t.lon,
          avgClimbRate: t.avgClimbRate,
          altGain: t.altGain,
          baseAlt: t.baseAlt,
          topAlt: t.topAlt,
          entryTime: new Date(t.entryTime * 1000),
          exitTime: new Date(t.exitTime * 1000),
          flightId: flight.id,
        })),
      });
    }

    await prisma.flight.update({
      where: { id: flight.id },
      data: { processed: true },
    });
    processed++;
    thermalCount += detected.length;
  }

  return { processed, thermals: thermalCount };
}

async function healStuckFlights(
  source: Source,
  dateStr: string,
  provider: FlightSourceProvider,
): Promise<number> {
  // Processed flights with hasTrackData=true but zero thermals — usually
  // victims of a transient track-fetch failure. Reprocess them.
  const suspects: {
    id: number;
    source_id: string;
  }[] = await prisma.$queryRawUnsafe(
    `
      SELECT f.id, f."sourceId" as source_id
      FROM flights f
      LEFT JOIN thermals t ON t."flightId" = f.id
      WHERE f.source = $1
        AND f."hasTrackData" = true
        AND f.processed = true
        AND f.date = $2::date
      GROUP BY f.id
      HAVING COUNT(t.id) = 0
    `,
    source,
    dateStr,
  );

  if (suspects.length === 0) return 0;

  let healed = 0;
  for (const flight of suspects) {
    const rawId = flight.source_id.replace(`${source}:`, "");
    const trackResult = await provider.getTrackPoints(rawId);

    if (trackResult.status === "failed" || trackResult.points.length === 0) {
      continue;
    }

    const detected = detectThermals(trackResult.points);
    if (detected.length === 0) continue;

    await prisma.thermal.createMany({
      data: detected.map((t) => ({
        lat: t.lat,
        lon: t.lon,
        avgClimbRate: t.avgClimbRate,
        altGain: t.altGain,
        baseAlt: t.baseAlt,
        topAlt: t.topAlt,
        entryTime: new Date(t.entryTime * 1000),
        exitTime: new Date(t.exitTime * 1000),
        flightId: flight.id,
      })),
    });
    healed += detected.length;
  }

  return healed;
}

async function finaliseProcessedDate(
  source: Source,
  dateStr: string,
): Promise<void> {
  const dateObj = new Date(`${dateStr}T00:00:00Z`);

  const totalThermals = await prisma.thermal.count({
    where: { flight: { source, date: dateObj } },
  });

  await prisma.processedDate.updateMany({
    where: { source, date: dateObj },
    data: {
      thermalCount: totalThermals,
      algorithmVersion: ALGORITHM_VERSION,
    },
  });
}

async function processSourceDate(source: Source, dateStr: string): Promise<void> {
  const provider = getProvider(source);
  const start = Date.now();

  try {
    await ensureFlightsCached(source, dateStr, provider);
    const { processed, thermals } = await processUnprocessedFlights(
      source,
      dateStr,
      provider,
    );
    const healed = await healStuckFlights(source, dateStr, provider);
    await finaliseProcessedDate(source, dateStr);

    const ms = Date.now() - start;
    console.log(
      `[processor] ${source} ${dateStr}: processed=${processed} thermals=${thermals} healed=${healed} (${ms}ms)`,
    );
  } catch (error) {
    console.error(`[processor] ${source} ${dateStr} failed:`, error);
  }
}

async function runCycle(): Promise<void> {
  const today = daysAgoUtc(0);
  const yesterday = daysAgoUtc(1);

  for (const source of VALID_SOURCES) {
    for (const dateStr of [yesterday, today]) {
      await processSourceDate(source, dateStr);
    }
  }
}

export function startProcessor(): void {
  console.log("[processor] starting, cycle interval 15 min");
  void runCycle();
  setInterval(() => void runCycle(), CYCLE_MS).unref();
}
