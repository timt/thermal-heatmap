import { Hono } from "hono";
import {
  isValidSource,
  VALID_SOURCES,
  getProvider,
} from "../lib/provider-factory.ts";

export const activityCalendarRoute = new Hono();

activityCalendarRoute.get("/activity-calendar", async (c) => {
  const source = c.req.query("source") ?? "bga";
  const season =
    c.req.query("season") ?? String(new Date().getFullYear());

  if (!isValidSource(source)) {
    return c.json(
      { error: `Invalid source. Valid: ${VALID_SOURCES.join(", ")}` },
      400,
    );
  }

  try {
    const provider = getProvider(source);

    if (!provider.getActivityCalendar) {
      return c.json({ dates: [] });
    }

    const calendar = await provider.getActivityCalendar(season);
    const dates = Array.from(calendar.entries()).map(
      ([date, flightCount]) => ({ date, flightCount }),
    );

    return c.json({ dates });
  } catch (error) {
    console.error("Failed to fetch activity calendar:", error);
    return c.json({ error: "Failed to fetch activity calendar" }, 500);
  }
});
