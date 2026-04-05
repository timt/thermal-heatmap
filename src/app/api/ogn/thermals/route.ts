import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectLiveThermals } from "@/lib/live-thermal-detector";
import type { LiveThermalResponse } from "@/lib/types";

const MIN_DETECT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_AGE_SECONDS = 3600;

let lastDetectTime = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const maxAgeSeconds = parseInt(
    searchParams.get("max_age") ?? String(DEFAULT_MAX_AGE_SECONDS),
    10,
  );
  const minClimb = parseFloat(searchParams.get("min_climb") ?? "0");

  if (isNaN(maxAgeSeconds) || maxAgeSeconds < 0) {
    return Response.json(
      { error: "Invalid 'max_age' parameter. Must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    const now = Date.now();

    // Run detection if enough time has passed
    let newThermals = 0;
    if (now - lastDetectTime >= MIN_DETECT_INTERVAL_MS) {
      lastDetectTime = now;
      newThermals = await detectLiveThermals();
    }

    // Read live thermals from DB
    const since = new Date(now - maxAgeSeconds * 1000);
    const thermals = await prisma.liveThermal.findMany({
      where: {
        exitTime: { gte: since },
        ...(minClimb > 0 ? { avgClimbRate: { gte: minClimb } } : {}),
      },
      orderBy: { exitTime: "desc" },
    });

    const result: readonly LiveThermalResponse[] = thermals.map((t) => ({
      deviceId: t.deviceId,
      lat: t.lat,
      lon: t.lon,
      avgClimbRate: t.avgClimbRate,
      altGain: t.altGain,
      baseAlt: t.baseAlt,
      topAlt: t.topAlt,
      entryTime: t.entryTime.toISOString(),
      exitTime: t.exitTime.toISOString(),
      detectedAt: t.detectedAt.toISOString(),
    }));

    return Response.json({
      thermals: result,
      count: result.length,
      newThermals,
      maxAgeSeconds,
    });
  } catch (error) {
    console.error("Error detecting live thermals:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
