import type {
  NormalisedFlight,
  TrackPoint,
  FlightSourceProvider,
} from "@/lib/types";
import { parseIgc } from "@/lib/igc-parser";

const BASE_URL = "https://api.bgaladder.net";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export class BGALadderProvider implements FlightSourceProvider {
  name = "bga";

  /** Convert ISO date (2026-03-26) to BGA format (26-Mar-2026) */
  private formatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split("-");
    return `${day}-${MONTH_ABBR[parseInt(month, 10) - 1]}-${year}`;
  }

  async getFlightIds(date: string): Promise<string[]> {
    const bgaDate = this.formatDate(date);
    const res = await fetch(`${BASE_URL}/API/FLIGHTIDS/${bgaDate}`);
    if (!res.ok) {
      throw new Error(`BGA FLIGHTIDS failed: ${res.status} ${res.statusText}`);
    }

    const ids: number[] = await res.json();
    return ids.map(String);
  }

  async getFlightDetail(id: string): Promise<NormalisedFlight> {
    const res = await fetch(`${BASE_URL}/API/FLIGHT/${id}`);
    if (!res.ok) {
      throw new Error(`BGA FLIGHT/${id} failed: ${res.status} ${res.statusText}`);
    }

    const f = await res.json();

    return {
      id: `bga:${f.FlightID}`,
      source: "bga",
      date: f.FlightDate.split("T")[0],
      pilot: f.Pilot.Fullname,
      club: f.Club.Name,
      aircraft: f.Glider.GliderType,
      registration: f.Glider.Registration ?? null,
      launchSite: f.Launchpoint.Site,
      region: "GB",
      launchLat: f.Launchpoint.Latitude,
      launchLon: f.Launchpoint.Longitude,
      distance: f.ScoringDistance,
      speed: f.HandicapSpeed === 0 ? null : f.HandicapSpeed,
      points: f.TotalPoints,
      sourceUrl: `https://www.bgaladder.net/Flight/${f.FlightID}`,
      hasTrackData: f.LoggerFileAvailable,
    };
  }

  async getTrackPoints(id: string): Promise<TrackPoint[]> {
    try {
      const res = await fetch(`${BASE_URL}/API/FLIGHTIGC/${id}`);
      if (!res.ok) return [];

      const igcContent = await res.text();
      return parseIgc(igcContent, "");
    } catch {
      return [];
    }
  }
}

/**
 * Fetch flight details for multiple IDs with concurrency limiting.
 * Processes in batches with a 100ms delay between each batch.
 */
export async function fetchFlightDetails(
  provider: BGALadderProvider,
  ids: string[],
  concurrency: number = 10,
): Promise<NormalisedFlight[]> {
  const results: NormalisedFlight[] = [];

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((id) => provider.getFlightDetail(id)),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    if (i + concurrency < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
