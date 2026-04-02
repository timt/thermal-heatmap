import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BGALadderProvider, fetchFlightDetails } from "@/lib/bga-provider";
import type { NormalisedFlight } from "@/lib/types";

function flightFromDb(row: {
  sourceId: string;
  source: string;
  date: Date;
  pilot: string;
  club: string;
  aircraft: string;
  registration: string | null;
  launchSite: string;
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
    launchLat: row.launchLat,
    launchLon: row.launchLon,
    distance: row.distance,
    speed: row.speed,
    points: row.points,
    sourceUrl: row.sourceUrl,
    hasTrackData: row.hasTrackData,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source");
  const date = searchParams.get("date");

  if (!source || !date) {
    return NextResponse.json(
      { error: "Both 'source' and 'date' query parameters are required" },
      { status: 400 },
    );
  }

  if (source !== "bga") {
    return NextResponse.json(
      { error: `Unsupported source: '${source}'. Only 'bga' is supported.` },
      { status: 400 },
    );
  }

  const dateObj = new Date(`${date}T00:00:00Z`);
  if (isNaN(dateObj.getTime())) {
    return NextResponse.json(
      { error: `Invalid date format: '${date}'. Use ISO format (YYYY-MM-DD).` },
      { status: 400 },
    );
  }

  try {
    // Check for cached flights
    const cached = await prisma.flight.findMany({
      where: { source, date: dateObj },
    });

    if (cached.length > 0) {
      const flights = cached.map(flightFromDb);
      return NextResponse.json({
        flights,
        totalCount: flights.length,
        withTrackData: flights.filter((f) => f.hasTrackData).length,
      });
    }

    // Fetch fresh data from BGA
    const provider = new BGALadderProvider();
    const ids = await provider.getFlightIds(date);

    if (ids.length === 0) {
      return NextResponse.json({
        flights: [],
        totalCount: 0,
        withTrackData: 0,
      });
    }

    const flights = await fetchFlightDetails(provider, ids);

    // Create ProcessedDate record
    const processedDate = await prisma.processedDate.create({
      data: {
        source,
        date: dateObj,
        flightCount: flights.length,
        thermalCount: 0,
        algorithmVersion: "none",
      },
    });

    // Upsert flights into DB
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
            launchLat: f.launchLat,
            launchLon: f.launchLon,
            distance: f.distance,
            speed: f.speed,
            points: f.points,
            sourceUrl: f.sourceUrl,
            hasTrackData: f.hasTrackData,
            processedDateId: processedDate.id,
          },
          update: {
            processedDateId: processedDate.id,
          },
        }),
      ),
    );

    return NextResponse.json({
      flights,
      totalCount: flights.length,
      withTrackData: flights.filter((f) => f.hasTrackData).length,
    });
  } catch (error) {
    console.error("Failed to fetch flights:", error);
    return NextResponse.json(
      { error: "Failed to fetch flights" },
      { status: 500 },
    );
  }
}
