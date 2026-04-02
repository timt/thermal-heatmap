import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);

    const city = await prisma.city.findUnique({ where: { id } });
    if (!city) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current_weather=true`
    );
    const weatherData = await weatherRes.json();

    return NextResponse.json(weatherData);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
