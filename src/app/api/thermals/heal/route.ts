import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSource, VALID_SOURCES, getProvider } from "@/lib/provider-factory";
import { detectThermals, ALGORITHM_VERSION } from "@/lib/thermal-detector";

/**
 * POST /api/thermals/heal
 *
 * Finds flights marked as processed with zero thermals but hasTrackData=true,
 * re-fetches their tracks, and reprocesses them. This heals data lost to
 * transient track fetch failures.
 *
 * Body: { source: string, date?: string }
 * - source: required
 * - date: optional ISO date to limit healing to a single day
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, date } = body as { source?: string; date?: string };

  if (!source || !isValidSource(source)) {
    return Response.json(
      { error: `Missing or invalid source. Valid: ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  const dateFilter = date ? { date: new Date(`${date}T00:00:00Z`) } : {};

  try {
    // Find flights that are processed with hasTrackData but have zero thermals
    const suspects = await prisma.flight.findMany({
      where: {
        source,
        hasTrackData: true,
        processed: true,
        ...dateFilter,
      },
      include: {
        _count: { select: { thermals: true } },
      },
    }).then(flights => flights.filter(f => f._count.thermals === 0));

    if (suspects.length === 0) {
      return Response.json({
        healed: 0,
        message: "No suspect flights found",
      });
    }

    const provider = getProvider(source);
    let healedCount = 0;
    let thermalsAdded = 0;
    const results: {
      sourceId: string;
      aircraft: string;
      registration: string | null;
      thermalsFound: number;
      status: string;
    }[] = [];

    for (const flight of suspects) {
      const rawId = flight.sourceId.replace(`${source}:`, "");
      const trackResult = await provider.getTrackPoints(rawId);

      if (trackResult.status === "failed") {
        results.push({
          sourceId: flight.sourceId,
          aircraft: flight.aircraft,
          registration: flight.registration,
          thermalsFound: 0,
          status: `fetch failed: ${trackResult.reason}`,
        });
        continue;
      }

      if (trackResult.points.length === 0) {
        results.push({
          sourceId: flight.sourceId,
          aircraft: flight.aircraft,
          registration: flight.registration,
          thermalsFound: 0,
          status: "no track points",
        });
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
        thermalsAdded += detected.length;
        healedCount++;
      }

      results.push({
        sourceId: flight.sourceId,
        aircraft: flight.aircraft,
        registration: flight.registration,
        thermalsFound: detected.length,
        status: detected.length > 0 ? "healed" : "genuinely no thermals",
      });
    }

    // Update ProcessedDate thermal counts for affected dates
    const affectedDates = [...new Set(suspects.map((f) => f.date.toISOString()))];
    for (const dateIso of affectedDates) {
      const d = new Date(dateIso);
      const totalThermals = await prisma.thermal.count({
        where: { flight: { source, date: d } },
      });
      await prisma.processedDate.updateMany({
        where: { source, date: d, algorithmVersion: ALGORITHM_VERSION },
        data: { thermalCount: totalThermals },
      });
    }

    return Response.json({
      suspectsFound: suspects.length,
      healed: healedCount,
      thermalsAdded,
      results,
    });
  } catch (error) {
    console.error("Heal failed:", error);
    return Response.json({ error: "Heal operation failed" }, { status: 500 });
  }
}
