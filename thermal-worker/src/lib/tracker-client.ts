import type { TrackerStatus } from "./types.ts";

const TRACKER_URL = "https://tracker.gliderzone.com/api/positions";
const DEFAULT_BBOX = "49.5,-8.0,61.0,2.0"; // UK
const DEFAULT_LIMIT = 5000;
const GLIDER_TYPE = 1;

export interface TrackerPosition {
  readonly id: string;
  readonly ts: string;
  readonly lat: number;
  readonly lon: number;
  readonly altM: number;
  readonly groundKt: number;
  readonly climbMs: number;
  readonly aircraftType: number;
  readonly deviceId: string;
  readonly registration: string | null;
  readonly model: string | null;
}

export interface TrackerFetchResult {
  readonly positions: readonly TrackerPosition[];
  readonly trackerStatus: TrackerStatus;
}

interface TrackerResponse {
  readonly positions: readonly TrackerPosition[];
  readonly count: number;
  readonly hasMore: boolean;
}

/**
 * Fetch positions from the tracker API using cursor-based pagination.
 * Returns all positions since the given timestamp, draining pages if necessary.
 */
export async function fetchTrackerPositions(
  since: Date,
): Promise<TrackerFetchResult> {
  const apiKey = process.env.TRACKER_API_KEY;
  if (!apiKey) {
    console.error("TRACKER_API_KEY environment variable is not set");
    return { positions: [], trackerStatus: "error" };
  }

  const allPositions: TrackerPosition[] = [];
  let cursor = since.toISOString();
  let hasMore = true;

  while (hasMore) {
    const url = new URL(TRACKER_URL);
    url.searchParams.set("since", cursor);
    url.searchParams.set("bbox", DEFAULT_BBOX);
    url.searchParams.set("aircraftType", String(GLIDER_TYPE));
    url.searchParams.set("limit", String(DEFAULT_LIMIT));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      console.error(`Tracker API fetch failed: ${response.status} ${response.statusText}`);
      return { positions: [], trackerStatus: "error" };
    }

    const data: TrackerResponse = await response.json();
    allPositions.push(...data.positions);
    hasMore = data.hasMore;

    if (data.positions.length > 0) {
      cursor = data.positions[data.positions.length - 1].ts;
    }
  }

  return {
    positions: allPositions,
    trackerStatus: allPositions.length > 0 ? "ok" : "no-data",
  };
}
