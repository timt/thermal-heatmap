import type { TrackPoint } from "@/lib/types";

/**
 * Parse an IGC file's B-records into TrackPoint[].
 *
 * B-record format (per IGC spec):
 *   BHHMMSSDDMM.MMMNDDMM.MMMEAPPPPPGGGGG
 *   0123456789...
 *
 * @param content    Raw IGC file text
 * @param flightDateIso  Fallback date "YYYY-MM-DD" (used when HFDTE header absent)
 * @returns TrackPoint[] sorted by time
 */
export function parseIgc(content: string, flightDateIso: string): TrackPoint[] {
  const dateFromHeader = extractHfdteDate(content);
  const baseDate = dateFromHeader ?? flightDateIso;

  const [year, month, day] = baseDate.split("-").map(Number);

  const points: TrackPoint[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("B")) continue;

    const point = parseBRecord(line, year, month, day);
    if (point !== null) {
      points.push(point);
    }
  }

  points.sort((a, b) => a.time - b.time);
  return points;
}

// B-record regex:
// B HHMMSS DDMMmmm N/S DDDMMmmm E/W V PPPPP GGGGG
// Indices (0-based after 'B'):
//  1-6   time
//  7-14  latitude (DDMMmmmN)
//  15-23 longitude (DDDMMmmmE)
//  24    validity A/V
//  25-29 pressure altitude
//  30-34 GPS altitude
const B_RECORD_RE =
  /^B(\d{6})(\d{7}[NS])(\d{8}[EW])([AV])([-\d]\d{4})(\d{5})/;

function parseBRecord(
  line: string,
  year: number,
  month: number,
  day: number,
): TrackPoint | null {
  const m = B_RECORD_RE.exec(line);
  if (!m) return null;

  const [, timeStr, latStr, lonStr, validity, pressAltStr, gpsAltStr] = m;

  // Filter out invalid fixes
  if (validity === "V") return null;

  const lat = parseLatitude(latStr);
  const lon = parseLongitude(lonStr);
  const pressAlt = parseInt(pressAltStr, 10);
  const gpsAlt = parseInt(gpsAltStr, 10);

  // Prefer GPS altitude; fall back to pressure altitude when GPS is 0
  const alt = gpsAlt !== 0 ? gpsAlt : pressAlt;

  const hours = parseInt(timeStr.slice(0, 2), 10);
  const minutes = parseInt(timeStr.slice(2, 4), 10);
  const seconds = parseInt(timeStr.slice(4, 6), 10);

  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  const time = Math.floor(date.getTime() / 1000);

  return { lat, lon, alt, time };
}

/**
 * Latitude: DDMMmmmN/S
 * DD = degrees, MM = minutes, mmm = milliminutes
 */
function parseLatitude(raw: string): number {
  const degrees = parseInt(raw.slice(0, 2), 10);
  const minutes = parseInt(raw.slice(2, 4), 10);
  const milliminutes = parseInt(raw.slice(4, 7), 10);
  const hemisphere = raw[7];

  const decimal = degrees + (minutes + milliminutes / 1000) / 60;
  return hemisphere === "S" ? -decimal : decimal;
}

/**
 * Longitude: DDDMMmmmE/W
 * DDD = degrees, MM = minutes, mmm = milliminutes
 */
function parseLongitude(raw: string): number {
  const degrees = parseInt(raw.slice(0, 3), 10);
  const minutes = parseInt(raw.slice(3, 5), 10);
  const milliminutes = parseInt(raw.slice(5, 8), 10);
  const hemisphere = raw[8];

  const decimal = degrees + (minutes + milliminutes / 1000) / 60;
  return hemisphere === "W" ? -decimal : decimal;
}

/**
 * Extract date from HFDTE header record.
 * Formats: HFDTEDDMMYY or HFDTEDATE:DDMMYY
 * Returns ISO date string "YYYY-MM-DD" or null.
 */
function extractHfdteDate(content: string): string | null {
  const match = content.match(/^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})\s*$/m);
  if (!match) return null;

  const [, dd, mm, yy] = match;
  // Two-digit year: 00-79 → 2000s, 80-99 → 1900s (IGC convention)
  const yyNum = parseInt(yy, 10);
  const fullYear = yyNum < 80 ? 2000 + yyNum : 1900 + yyNum;

  return `${fullYear}-${mm}-${dd}`;
}
