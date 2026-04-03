import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALGORITHM_VERSION } from "@/lib/thermal-detector";
import { isValidSource, VALID_SOURCES, getProvider } from "@/lib/provider-factory";

function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const source = searchParams.get("source");
  const dateStr = searchParams.get("date");
  const minClimb = parseFloat(searchParams.get("min_climb") ?? "0.5");

  if (!source || !isValidSource(source)) {
    return Response.json(
      { error: `Missing or invalid 'source' parameter. Valid: ${VALID_SOURCES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!dateStr || !isValidDateString(dateStr)) {
    return Response.json(
      { error: "Missing or invalid 'date' parameter. Expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (isNaN(minClimb) || minClimb < 0) {
    return Response.json(
      { error: "Invalid 'min_climb' parameter. Must be a non-negative number" },
      { status: 400 }
    );
  }

  const date = new Date(dateStr + "T00:00:00.000Z");

  try {
    // Check if this source+date+algorithm combination has been processed
    const processedDate = await prisma.processedDate.findFirst({
      where: {
        source,
        date,
        algorithmVersion: ALGORITHM_VERSION,
      },
    });

    if (processedDate) {
      // Cached — fetch thermals via flights linked to this processed date
      const thermals = await prisma.thermal.findMany({
        where: {
          flight: {
            processedDateId: processedDate.id,
          },
          avgClimbRate: { gte: minClimb },
        },
        select: {
          lat: true,
          lon: true,
          avgClimbRate: true,
          altGain: true,
          baseAlt: true,
          topAlt: true,
          entryTime: true,
          exitTime: true,
        },
      });

      return Response.json({
        status: "ready",
        thermals,
        metadata: {
          source,
          date: dateStr,
          flightCount: processedDate.flightCount,
          thermalCount: processedDate.thermalCount,
          processedAt: processedDate.processedAt.toISOString(),
          lastCheckedAt: processedDate.lastCheckedAt?.toISOString() ?? null,
          algorithmVersion: processedDate.algorithmVersion,
        },
      });
    }

    // Not cached — provide a flight count hint
    // First check if we already have flights in the DB for this date/source
    const dbFlightCount = await prisma.flight.count({
      where: { source, date },
    });

    if (dbFlightCount > 0) {
      const withTrackData = await prisma.flight.count({
        where: { source, date, hasTrackData: true },
      });

      return Response.json({
        status: "needs_processing",
        flightCount: dbFlightCount,
        withTrackData,
      });
    }

    // No flights in DB — quickly fetch IDs from the provider for a count hint
    const provider = getProvider(source);
    const flightIds = await provider.getFlightIds(dateStr);

    return Response.json({
      status: "needs_processing",
      flightCount: flightIds.length,
      withTrackData: 0,
    });
  } catch (error) {
    console.error("Error fetching thermals:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
