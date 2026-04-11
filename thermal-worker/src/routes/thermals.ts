import { Hono } from "hono";
import { prisma } from "../db.ts";
import { ALGORITHM_VERSION } from "../lib/thermal-detector.ts";
import {
  isValidSource,
  VALID_SOURCES,
  getProvider,
} from "../lib/provider-factory.ts";

function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export const thermalsRoute = new Hono();

thermalsRoute.get("/thermals", async (c) => {
  const source = c.req.query("source");
  const dateStr = c.req.query("date");
  const minClimb = parseFloat(c.req.query("min_climb") ?? "0.5");

  if (!source || !isValidSource(source)) {
    return c.json(
      {
        error: `Missing or invalid 'source' parameter. Valid: ${VALID_SOURCES.join(", ")}`,
      },
      400,
    );
  }

  if (!dateStr || !isValidDateString(dateStr)) {
    return c.json(
      { error: "Missing or invalid 'date' parameter. Expected YYYY-MM-DD" },
      400,
    );
  }

  if (isNaN(minClimb) || minClimb < 0) {
    return c.json(
      { error: "Invalid 'min_climb' parameter. Must be a non-negative number" },
      400,
    );
  }

  const date = new Date(dateStr + "T00:00:00.000Z");

  try {
    const processedDate = await prisma.processedDate.findFirst({
      where: {
        source,
        date,
        algorithmVersion: ALGORITHM_VERSION,
      },
    });

    if (processedDate) {
      const thermals = await prisma.thermal.findMany({
        where: {
          flight: { processedDateId: processedDate.id },
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
          flightId: true,
          flight: { select: { aircraft: true, registration: true } },
        },
      });

      const flatThermals = thermals.map(({ flight, ...rest }) => ({
        ...rest,
        aircraft: flight.aircraft,
        registration: flight.registration,
      }));

      return c.json({
        status: "ready",
        thermals: flatThermals,
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

    // Not yet processed by the worker. Give the client a flight-count hint so
    // it can render a "processing" state with approximate progress. Unlike the
    // old Next.js endpoint, we never return "needs_processing" — the worker
    // always processes on its own timer, so the client just waits.
    const dbFlightCount = await prisma.flight.count({
      where: { source, date },
    });

    if (dbFlightCount > 0) {
      const withTrackData = await prisma.flight.count({
        where: { source, date, hasTrackData: true },
      });

      return c.json({
        status: "processing",
        flightCount: dbFlightCount,
        withTrackData,
      });
    }

    // No flights in DB yet — probe the provider for a count hint.
    const provider = getProvider(source);
    const flightIds = await provider.getFlightIds(dateStr);

    return c.json({
      status: "processing",
      flightCount: flightIds.length,
      withTrackData: 0,
    });
  } catch (error) {
    console.error("Error fetching thermals:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
