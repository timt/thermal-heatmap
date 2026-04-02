import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "bga";

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

  return Response.json({ dates });
}
