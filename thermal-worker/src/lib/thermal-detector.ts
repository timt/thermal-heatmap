import type {
  TrackPoint,
  DetectedThermal,
  ThermalDetectionParams,
} from "./types.ts";

export const DEFAULT_PARAMS: ThermalDetectionParams = {
  minClimbRate: 0.5,
  windowSize: 8,
  minHeadingChange: 180,
  extensionClimbFactor: 0.3,
  minAltGain: 30,
  sampleRate: 4,
};

export const ALGORITHM_VERSION = "1.0";

/** Calculate bearing in degrees between two points. */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return toDeg(Math.atan2(y, x));
}

/** Normalise angle difference to -180..+180 */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Detect thermals from a flight track using a sliding-window approach
 * that checks for sustained climbing while circling.
 */
export function detectThermals(
  track: TrackPoint[],
  params?: Partial<ThermalDetectionParams>,
): DetectedThermal[] {
  const p = { ...DEFAULT_PARAMS, ...params };
  const thermals: DetectedThermal[] = [];

  // 1. Pre-process: sample every Nth point, ensure sorted by time
  const sampled = track
    .filter((_, idx) => idx % p.sampleRate === 0)
    .sort((a, b) => a.time - b.time);

  if (sampled.length < p.windowSize) return thermals;

  // 2. Sliding window scan
  let i = 0;
  while (i <= sampled.length - p.windowSize) {
    const windowStart = sampled[i];
    const windowEnd = sampled[i + p.windowSize - 1];

    // 2a. Climb check
    const dt = windowEnd.time - windowStart.time;
    if (dt <= 0) {
      i++;
      continue;
    }
    const avgClimb = (windowEnd.alt - windowStart.alt) / dt;
    if (avgClimb < p.minClimbRate) {
      i++;
      continue;
    }

    // 2b. Circling check — accumulate absolute heading changes
    let totalHeadingChange = 0;
    for (let j = i; j < i + p.windowSize - 1; j++) {
      const b1 = bearing(sampled[j].lat, sampled[j].lon, sampled[j + 1].lat, sampled[j + 1].lon);
      const b2 = bearing(
        sampled[j + 1].lat,
        sampled[j + 1].lon,
        sampled[Math.min(j + 2, sampled.length - 1)].lat,
        sampled[Math.min(j + 2, sampled.length - 1)].lon,
      );
      totalHeadingChange += Math.abs(angleDiff(b1, b2));
    }
    if (totalHeadingChange < p.minHeadingChange) {
      i++;
      continue;
    }

    // 2c. Thermal extension — extend forward while local climb rate holds
    let end = i + p.windowSize - 1;
    while (end + 1 < sampled.length) {
      const localDt = sampled[end + 1].time - sampled[end].time;
      if (localDt <= 0) break;
      const localClimb = (sampled[end + 1].alt - sampled[end].alt) / localDt;
      if (localClimb < p.minClimbRate * p.extensionClimbFactor) break;
      end++;
    }

    // 2d. Thermal recording
    const thermalPoints = sampled.slice(i, end + 1);
    const first = thermalPoints[0];
    const last = thermalPoints[thermalPoints.length - 1];
    const altGain = last.alt - first.alt;

    if (altGain >= p.minAltGain) {
      const centroidLat = thermalPoints.reduce((sum, pt) => sum + pt.lat, 0) / thermalPoints.length;
      const centroidLon = thermalPoints.reduce((sum, pt) => sum + pt.lon, 0) / thermalPoints.length;
      const totalDt = last.time - first.time;

      thermals.push({
        lat: centroidLat,
        lon: centroidLon,
        avgClimbRate: totalDt > 0 ? altGain / totalDt : 0,
        altGain,
        baseAlt: first.alt,
        topAlt: last.alt,
        entryTime: first.time,
        exitTime: last.time,
      });
    }

    // 2e. Advance past this thermal
    i = end + 1;
  }

  return thermals;
}
