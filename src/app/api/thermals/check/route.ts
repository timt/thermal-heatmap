import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSource, VALID_SOURCES, getProvider } from "@/lib/provider-factory";

function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

/**
 * GET /api/thermals/check?source=bga&date=2026-03-26
 *
 * Checks the provider for new flights since last processing.
 * Updates lastCheckedAt on the ProcessedDate record.
 * Returns the number of new flights available.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source");
  const dateStr = searchParams.get("date");

  if (!source || !isValidSource(source)) {
    return Response.json(
      { error: `Missing or invalid 'source'. Valid: ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!dateStr || !isValidDateString(dateStr)) {
    return Response.json(
      { error: "Missing or invalid 'date'. Expected YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const date = new Date(dateStr + "T00:00:00.000Z");

  try {
    const processedDate = await prisma.processedDate.findFirst({
      where: { source, date },
    });

    if (!processedDate) {
      return Response.json({ newFlights: 0 });
    }

    const provider = getProvider(source);
    const currentIds = await provider.getFlightIds(dateStr);
    const newFlights = currentIds.length - processedDate.flightCount;

    const now = new Date();

    if (newFlights > 0) {
      // Invalidate the cache: delete thermals, unlink flights, remove ProcessedDate
      // so the next loadDate cycle re-fetches from the provider and re-processes
      await prisma.thermal.deleteMany({
        where: { flight: { processedDateId: processedDate.id } },
      });
      await prisma.flight.deleteMany({
        where: { processedDateId: processedDate.id },
      });
      await prisma.processedDate.delete({ where: { id: processedDate.id } });
    } else {
      // No new flights — just update lastCheckedAt
      await prisma.processedDate.update({
        where: { id: processedDate.id },
        data: { lastCheckedAt: now },
      });
    }

    return Response.json({
      newFlights: Math.max(0, newFlights),
      cachedCount: processedDate.flightCount,
      currentCount: currentIds.length,
    });
  } catch (error) {
    console.error("Error checking for new flights:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
