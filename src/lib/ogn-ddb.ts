import { prisma } from "@/lib/prisma";

const DDB_URL = "http://ddb.glidernet.org/download/?j=1&t=1";
const DEFAULT_MAX_AGE_HOURS = 24;

interface DdbRecord {
  readonly device_type: string;
  readonly device_id: string;
  readonly aircraft_model: string;
  readonly registration: string;
  readonly cn: string;
  readonly tracked: string;
  readonly identified: string;
  readonly aircraft_type: number;
}

export async function refreshDdbIfStale(maxAgeHours = DEFAULT_MAX_AGE_HOURS): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const latest = await prisma.ognDevice.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  if (latest && latest.updatedAt > cutoff) return;

  console.log("Refreshing OGN DDB cache...");
  const response = await fetch(DDB_URL);
  if (!response.ok) {
    console.error(`DDB fetch failed: ${response.status} ${response.statusText}`);
    return;
  }

  const data: readonly DdbRecord[] = await response.json();
  const now = new Date();

  // Process in batches to avoid overwhelming the DB
  const BATCH_SIZE = 500;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((record) =>
        prisma.ognDevice.upsert({
          where: { deviceId: record.device_id },
          update: {
            deviceType: record.device_type,
            aircraftModel: record.aircraft_model,
            registration: record.registration,
            cn: record.cn,
            tracked: record.tracked === "Y",
            identified: record.identified === "Y",
            aircraftType: record.aircraft_type,
            updatedAt: now,
          },
          create: {
            deviceId: record.device_id,
            deviceType: record.device_type,
            aircraftModel: record.aircraft_model,
            registration: record.registration,
            cn: record.cn,
            tracked: record.tracked === "Y",
            identified: record.identified === "Y",
            aircraftType: record.aircraft_type,
            updatedAt: now,
          },
        }),
      ),
    );
  }

  console.log(`OGN DDB cache refreshed: ${data.length} devices`);
}

export async function getUntrackedDeviceIds(): Promise<Set<string>> {
  const devices = await prisma.ognDevice.findMany({
    where: { tracked: false },
    select: { deviceId: true },
  });
  return new Set(devices.map((d) => d.deviceId));
}

export async function getUnidentifiedDeviceIds(): Promise<Set<string>> {
  const devices = await prisma.ognDevice.findMany({
    where: { identified: false },
    select: { deviceId: true },
  });
  return new Set(devices.map((d) => d.deviceId));
}
