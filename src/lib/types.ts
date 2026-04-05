/** Normalised flight metadata from any data source */
export interface NormalisedFlight {
  id: string;                  // Source-prefixed: "bga:128982"
  source: "weglide" | "bga";
  date: string;                // ISO format: "2026-03-26"
  pilot: string;
  club: string;
  aircraft: string;
  registration: string | null;
  launchSite: string;
  region: string | null;
  launchLat: number;
  launchLon: number;
  distance: number;            // km
  speed: number | null;        // km/h
  points: number | null;
  sourceUrl: string;
  hasTrackData: boolean;
}

/** A single point on a flight track */
export interface TrackPoint {
  lat: number;    // Decimal degrees
  lon: number;    // Decimal degrees
  alt: number;    // Altitude in metres (GPS preferred)
  time: number;   // Unix timestamp in seconds
}

/** A detected thermal */
export interface DetectedThermal {
  lat: number;          // Centroid latitude
  lon: number;          // Centroid longitude
  avgClimbRate: number; // m/s
  altGain: number;      // metres
  baseAlt: number;      // metres
  topAlt: number;       // metres
  entryTime: number;    // Unix timestamp
  exitTime: number;     // Unix timestamp
}

/** Parameters for thermal detection */
export interface ThermalDetectionParams {
  minClimbRate: number;          // Default 0.5 m/s
  windowSize: number;            // Default 8 points
  minHeadingChange: number;      // Default 180°
  extensionClimbFactor: number;  // Default 0.3
  minAltGain: number;            // Default 30m
  sampleRate: number;            // Default 4 (every Nth point)
}

/** A live glider position from OGN (API response shape) */
export interface LiveGliderPosition {
  readonly deviceId: string;
  readonly callsign: string;
  readonly registration: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly altMetres: number;
  readonly heading: number;
  readonly speedKmh: number;
  readonly climbRateMs: number;
  readonly timestamp: string; // ISO 8601
  readonly receiver: string;
}

/** A live thermal detected from OGN positions (API response shape) */
export interface LiveThermalResponse {
  readonly deviceId: string;
  readonly lat: number;
  readonly lon: number;
  readonly avgClimbRate: number;
  readonly altGain: number;
  readonly baseAlt: number;
  readonly topAlt: number;
  readonly entryTime: string; // ISO 8601
  readonly exitTime: string;  // ISO 8601
  readonly detectedAt: string; // ISO 8601
}

/** Interface for data source providers */
export interface FlightSourceProvider {
  name: string;
  getFlightIds(date: string): Promise<string[]>;
  getFlightDetail(id: string): Promise<NormalisedFlight>;
  getTrackPoints(id: string): Promise<TrackPoint[]>;
  getActivityCalendar?(season: string): Promise<Map<string, number>>;
}
