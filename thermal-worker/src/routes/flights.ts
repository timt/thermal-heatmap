import { Hono } from "hono";
import { prisma } from "../db.ts";
import {
  isValidSource,
  VALID_SOURCES,
  getProvider,
  fetchFlightDetailsForSource,
} from "../lib/provider-factory.ts";
import type { NormalisedFlight } from "../lib/types.ts";

function flightFromDb(row: {
  sourceId: string;
  source: string;
  date: Date;
  pilot: string;
  club: string;
  aircraft: string;
  registration: string | null;
  launchSite: string;
  region: string | null;
  launchLat: number;
  launchLon: number;
  distance: number;
  speed: number | null;
  points: number | null;
  sourceUrl: string;
  hasTrackData: boolean;
}): NormalisedFlight {
  return {
    id: row.sourceId,
    source: row.source as NormalisedFlight["source"],
    date: row.date.toISOString().split("T")[0],
    pilot: row.pilot,
    club: row.club,
    aircraft: row.aircraft,
    registration: row.registration,
    launchSite: row.launchSite,
    region: row.region,
    launchLat: row.launchLat,
    launchLon: row.launchLon,
    distance: row.distance,
    speed: row.speed,
    points: row.points,
    sourceUrl: row.sourceUrl,
    hasTrackData: row.hasTrackData,
  };
}

export const flightsRoute = new Hono();

flightsRoute.get("/flights", async (c) => {
  const source = c.req.query("source");
  const date = c.req.query("date");
  const region = c.req.query("region");

  if (!source || !date) {
    return c.json(
      { error: "Both 'source' and 'date' query parameters are required" },
      400,
    );
  }

  if (!isValidSource(source)) {
    return c.json(
      {
        error: `Unsupported source: '${source}'. Valid: ${VALID_SOURCES.join(", ")}`,
      },
      400,
    );
  }

  const dateObj = new Date(`${date}T00:00:00Z`);
  if (isNaN(dateObj.getTime())) {
    return c.json(
      { error: `Invalid date format: '${date}'. Use ISO format (YYYY-MM-DD).` },
      400,
    );
  }

  try {
    const cached = await prisma.flight.findMany({
      where: { source, date: dateObj },
    });

    if (cached.length > 0) {
      let flights = cached.map(flightFromDb);
      if (region) {
        flights = flights.filter((f) => f.region === region);
      }
      return c.json({
        flights,
        totalCount: flights.length,
        withTrackData: flights.filter((f) => f.hasTrackData).length,
      });
    }

    // Fetch fresh data from source provider and persist.
    const provider = getProvider(source);
    const ids = await provider.getFlightIds(date);

    if (ids.length === 0) {
      return c.json({ flights: [], totalCount: 0, withTrackData: 0 });
    }

    const flights = await fetchFlightDetailsForSource(provider, ids);

    const processedDate = await prisma.processedDate.create({
      data: {
        source,
        date: dateObj,
        flightCount: flights.length,
        thermalCount: 0,
        algorithmVersion: "none",
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

    const filtered = region
      ? flights.filter((f) => f.region === region)
      : flights;

    return c.json({
      flights: filtered,
      totalCount: filtered.length,
      withTrackData: filtered.filter((f) => f.hasTrackData).length,
    });
  } catch (error) {
    console.error("Failed to fetch flights:", error);
    return c.json({ error: "Failed to fetch flights" }, 500);
  }
});
