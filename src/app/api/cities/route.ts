import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const cities = await prisma.city.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(cities);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch cities" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`
    );
    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    const { latitude, longitude } = geoData.results[0];

    const city = await prisma.city.create({
      data: { name, latitude, longitude },
    });

    return NextResponse.json(city, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create city" }, { status: 500 });
  }
}
