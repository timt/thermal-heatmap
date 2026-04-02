import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
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

    const city = await prisma.city.update({
      where: { id },
      data: { name, latitude, longitude },
    });

    return NextResponse.json(city);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update city" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);

    await prisma.city.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete city" }, { status: 500 });
  }
}
