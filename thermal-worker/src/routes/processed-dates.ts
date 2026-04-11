import { Hono } from "hono";
import { prisma } from "../db.ts";

export const processedDatesRoute = new Hono();

processedDatesRoute.get("/processed-dates", async (c) => {
  const source = c.req.query("source") ?? "bga";

  const records = await prisma.processedDate.findMany({
    where: { source },
    select: { date: true, flightCount: true, thermalCount: true },
    orderBy: { date: "desc" },
  });

  const dates = records.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    flightCount: r.flightCount,
    thermalCount: r.thermalCount,
  }));

  return c.json({ dates });
});
