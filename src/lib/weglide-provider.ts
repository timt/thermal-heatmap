import type {
  NormalisedFlight,
  TrackPoint,
  TrackFetchResult,
  FlightSourceProvider,
} from "@/lib/types";

const BASE_URL = "https://api.weglide.org";
const CDN_URL = "https://cdn.weglide.org";
const PAGE_LIMIT = 100;

const HEADERS = {
  Accept: "application/json",
  Referer: "https://www.weglide.org/",
  Origin: "https://www.weglide.org",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

interface WeGlideFlight {
  id: number;
  user: { id: number; name: string };
  takeoff_airport: { id: number; name: string; region: string };
  aircraft: { id: number; name: string };
  club: { id: number; name: string } | null;
  takeoff_time: string;
  landing_time: string;
  scoring_date: string;
  bbox: [number, number, number, number]; // [lon_min, lat_min, lon_max, lat_max]
  contest: { points: number; distance: number; speed: number };
}

function normaliseWeGlideFlight(f: WeGlideFlight): NormalisedFlight {
  // Derive approximate launch coordinates from bbox centre
  const launchLat = (f.bbox[1] + f.bbox[3]) / 2;
  const launchLon = (f.bbox[0] + f.bbox[2]) / 2;

  return {
    id: `weglide:${f.id}`,
    source: "weglide",
    date: f.scoring_date,
    pilot: f.user.name,
    club: f.club?.name ?? "",
    aircraft: f.aircraft.name,
    registration: null,
    launchSite: f.takeoff_airport.name,
    region: f.takeoff_airport.region,
    launchLat,
    launchLon,
    distance: f.contest.distance,
    speed: f.contest.speed === 0 ? null : f.contest.speed,
    points: f.contest.points,
    sourceUrl: `https://www.weglide.org/flight/${f.id}`,
    hasTrackData: true,
  };
}

export class WeGlideProvider implements FlightSourceProvider {
  name = "weglide";

  /** Cache of flight list responses keyed by date, used to avoid re-fetching */
  private flightCache = new Map<string, WeGlideFlight[]>();

  private async fetchFlightList(date: string): Promise<WeGlideFlight[]> {
    const cached = this.flightCache.get(date);
    if (cached) return cached;

    const flights: WeGlideFlight[] = [];
    let skip = 0;

    while (true) {
      const url = `${BASE_URL}/v1/flight?scoring_date_start=${date}&scoring_date_end=${date}&skip=${skip}&limit=${PAGE_LIMIT}&include_story=false&include_stats=false`;
      const res = await fetch(url, { headers: HEADERS });

      if (!res.ok) {
        throw new Error(
          `WeGlide flight list failed: ${res.status} ${res.statusText}`,
        );
      }

      const page: WeGlideFlight[] = await res.json();
      flights.push(...page);

      if (page.length < PAGE_LIMIT) break;
      skip += PAGE_LIMIT;
    }

    this.flightCache.set(date, flights);
    return flights;
  }

  async getFlightIds(date: string): Promise<string[]> {
    const flights = await this.fetchFlightList(date);
    return flights.map((f) => String(f.id));
  }

  async getFlightDetail(id: string): Promise<NormalisedFlight> {
    // WeGlide doesn't have a working single-flight detail endpoint.
    // Search the cached flight list instead.
    const numericId = Number(id);
    for (const flights of this.flightCache.values()) {
      const found = flights.find((f) => f.id === numericId);
      if (found) return normaliseWeGlideFlight(found);
    }

    throw new Error(
      `WeGlide flight ${id} not found in cache. Call getFlightIds first.`,
    );
  }

  async getTrackPoints(id: string): Promise<TrackFetchResult> {
    try {
      const res = await fetch(`${CDN_URL}/v1/flightdata/${id}`, {
        headers: HEADERS,
      });
      if (!res.ok) {
        return { status: "failed", reason: `WeGlide track fetch returned ${res.status}` };
      }

      const data: {
        geom: { coordinates: [number, number][] };
        time: number[];
        alt: number[];
      } = await res.json();

      const { coordinates } = data.geom;
      const { time, alt } = data;
      const n = time.length;
      const total = coordinates.length;

      // Sample n evenly-spaced coordinates to match the time/alt arrays
      const points: TrackPoint[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.round((i * (total - 1)) / (n - 1));
        const [lon, lat] = coordinates[idx];
        points.push({ lat, lon, alt: alt[i], time: time[i] });
      }

      return { status: "ok", points };
    } catch (e) {
      return { status: "failed", reason: `WeGlide track fetch error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async getActivityCalendar(
    season: string,
  ): Promise<Map<string, number>> {
    const url = `${BASE_URL}/v1/flight/activity?season=${season}&new_format=true`;
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      throw new Error(
        `WeGlide activity calendar failed: ${res.status} ${res.statusText}`,
      );
    }

    const data: [string, number][] = await res.json();
    return new Map(data);
  }
}

/**
 * Fetch flight details for multiple IDs with concurrency limiting.
 * For WeGlide, the list endpoint already returns full details,
 * so this just maps cached data. The provider must have fetched
 * the flight list first via getFlightIds().
 */
export async function fetchWeGlideFlightDetails(
  provider: WeGlideProvider,
  ids: string[],
): Promise<NormalisedFlight[]> {
  const results: NormalisedFlight[] = [];

  for (const id of ids) {
    try {
      results.push(await provider.getFlightDetail(id));
    } catch {
      // Skip flights not found in cache
    }
  }

  return results;
}
