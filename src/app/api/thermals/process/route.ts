import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BGALadderProvider } from "@/lib/bga-provider";
import { detectThermals, ALGORITHM_VERSION } from "@/lib/thermal-detector";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { source, date, flightIds } = body as {
    source?: string;
    date?: string;
    flightIds?: string[];
  };

  if (!source || !date || !flightIds) {
    return NextResponse.json(
      { error: "Missing required fields: source, date, flightIds" },
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

  if (!Array.isArray(flightIds) || flightIds.length === 0) {
    return NextResponse.json(
      { error: "flightIds must be a non-empty array" },
      { status: 400 },
    );
  }

  try {
    const provider = new BGALadderProvider();
    let processedCount = 0;
    let thermalsFoundCount = 0;
    const allThermals: {
      lat: number;
      lon: number;
      avgClimbRate: number;
      altGain: number;
      baseAlt: number;
      topAlt: number;
      entryTime: Date;
      exitTime: Date;
    }[] = [];

    for (const rawId of flightIds) {
      const sourceId = `bga:${rawId}`;

      // Check if already processed
      const flight = await prisma.flight.findUnique({
        where: { sourceId },
      });

      if (!flight) {
        console.warn(`Flight not found: ${sourceId}, skipping`);
        continue;
      }

      if (flight.processed) {
        continue;
      }

      // Fetch track points from BGA
      const trackPoints = await provider.getTrackPoints(rawId);

      if (trackPoints.length === 0) {
        // Mark as processed even with no track data
        await prisma.flight.update({
          where: { id: flight.id },
          data: { processed: true },
        });
        processedCount++;
        continue;
      }

      // Run thermal detection
      const detected = detectThermals(trackPoints);

      // Persist thermals to DB
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

      // Mark flight as processed
      await prisma.flight.update({
        where: { id: flight.id },
        data: { processed: true },
      });

      processedCount++;
      thermalsFoundCount += detected.length;
      allThermals.push(
        ...detected.map((t) => ({
          lat: t.lat,
          lon: t.lon,
          avgClimbRate: t.avgClimbRate,
          altGain: t.altGain,
          baseAlt: t.baseAlt,
          topAlt: t.topAlt,
          entryTime: new Date(t.entryTime * 1000),
          exitTime: new Date(t.exitTime * 1000),
        })),
      );
    }

    // Update ProcessedDate record with running totals
    const totalThermals = await prisma.thermal.count({
      where: {
        flight: {
          source,
          date: dateObj,
        },
      },
    });

    const totalFlightsProcessed = await prisma.flight.count({
      where: {
        source,
        date: dateObj,
        processed: true,
      },
    });

    await prisma.processedDate.update({
      where: {
        source_date: { source, date: dateObj },
      },
      data: {
        thermalCount: totalThermals,
        algorithmVersion: ALGORITHM_VERSION,
      },
    });

    return NextResponse.json({
      processed: processedCount,
      thermalsFound: thermalsFoundCount,
      thermals: allThermals,
      runningTotals: {
        flightsProcessed: totalFlightsProcessed,
        totalThermals,
      },
    });
  } catch (error) {
    console.error("Failed to process thermals:", error);
    return NextResponse.json(
      { error: "Failed to process thermals" },
      { status: 500 },
    );
  }
}
