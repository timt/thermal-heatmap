const OGN_LIVE_URL = "http://live.glidernet.org/lxml.php";
const FT_TO_M = 0.3048;
const FTMIN_TO_MS = 0.00508;
const MAX_AGE_SECONDS = 120;
const MARKER_RE = /<m\s+a="([^"]+)"\s*\/>/g;

const GLIDER_TYPE = 0;

export interface OgnPosition {
  readonly deviceId: string;
  readonly callsign: string;
  readonly registration: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly altMetres: number;
  readonly heading: number;
  readonly speedKmh: number;
  readonly climbRateMs: number;
  readonly aircraftType: number;
  readonly receiver: string;
  readonly icaoHex: string | null;
  readonly timestamp: Date;
}

export interface BoundingBox {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

const UK_BOUNDS: BoundingBox = {
  north: 58.0,
  south: 49.0,
  east: 2.0,
  west: -8.0,
};

export function parseOgnXml(xml: string, fetchedAt: Date): readonly OgnPosition[] {
  const results: OgnPosition[] = [];

  for (const match of xml.matchAll(MARKER_RE)) {
    const fields = match[1].split(",");
    if (fields.length < 14) continue;

    const ageSeconds = parseInt(fields[6], 10);
    if (isNaN(ageSeconds) || ageSeconds > MAX_AGE_SECONDS) continue;

    const aircraftType = parseInt(fields[10], 10);
    if (aircraftType !== GLIDER_TYPE) continue;

    const lat = parseFloat(fields[0]);
    const lon = parseFloat(fields[1]);
    const altFeet = parseFloat(fields[4]);
    const climbFtMin = parseFloat(fields[9]);
    const heading = parseInt(fields[7], 10);
    const speedKmh = parseFloat(fields[8]);

    if (isNaN(lat) || isNaN(lon) || isNaN(altFeet)) continue;

    const timestamp = new Date(fetchedAt.getTime() - ageSeconds * 1000);

    results.push({
      deviceId: fields[13],
      callsign: fields[2],
      registration: fields[3] || null,
      lat,
      lon,
      altMetres: altFeet * FT_TO_M,
      heading: isNaN(heading) ? 0 : heading,
      speedKmh: isNaN(speedKmh) ? 0 : speedKmh,
      climbRateMs: isNaN(climbFtMin) ? 0 : climbFtMin * FTMIN_TO_MS,
      aircraftType,
      receiver: fields[11],
      icaoHex: fields[12] || null,
      timestamp,
    });
  }

  return results;
}

export async function fetchLivePositions(
  bounds: BoundingBox = UK_BOUNDS,
): Promise<readonly OgnPosition[]> {
  const url = `${OGN_LIVE_URL}?a=0&b=${bounds.north}&c=${bounds.south}&d=${bounds.east}&e=${bounds.west}&z=6`;
  const fetchedAt = new Date();

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`OGN fetch failed: ${response.status} ${response.statusText}`);
    return [];
  }

  const xml = await response.text();
  return parseOgnXml(xml, fetchedAt);
}
