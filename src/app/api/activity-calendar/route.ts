import { isValidSource, VALID_SOURCES, getProvider } from "@/lib/provider-factory";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "bga";
  const season = searchParams.get("season") ?? String(new Date().getFullYear());

  if (!isValidSource(source)) {
    return Response.json(
      { error: `Invalid source. Valid: ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const provider = getProvider(source);

    if (!provider.getActivityCalendar) {
      return Response.json({ dates: [] });
    }

    const calendar = await provider.getActivityCalendar(season);
    const dates = Array.from(calendar.entries()).map(([date, flightCount]) => ({
      date,
      flightCount,
    }));

    return Response.json({ dates });
  } catch (error) {
    console.error("Failed to fetch activity calendar:", error);
    return Response.json(
      { error: "Failed to fetch activity calendar" },
      { status: 500 },
    );
  }
}
