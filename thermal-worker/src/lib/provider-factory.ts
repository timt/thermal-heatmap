import type { FlightSourceProvider, NormalisedFlight } from "./types.ts";
import { BGALadderProvider, fetchFlightDetails } from "./bga-provider.ts";
import {
  WeGlideProvider,
  fetchWeGlideFlightDetails,
} from "./weglide-provider.ts";

export const VALID_SOURCES = ["bga", "weglide"] as const;
export type Source = (typeof VALID_SOURCES)[number];

export function isValidSource(s: string): s is Source {
  return VALID_SOURCES.includes(s as Source);
}

export function getProvider(source: Source): FlightSourceProvider {
  switch (source) {
    case "bga":
      return new BGALadderProvider();
    case "weglide":
      return new WeGlideProvider();
  }
}

/**
 * Fetch flight details for multiple IDs using the appropriate
 * provider-specific batch strategy.
 */
export async function fetchFlightDetailsForSource(
  provider: FlightSourceProvider,
  ids: string[],
): Promise<NormalisedFlight[]> {
  if (provider instanceof BGALadderProvider) {
    return fetchFlightDetails(provider, ids);
  }
  if (provider instanceof WeGlideProvider) {
    return fetchWeGlideFlightDetails(provider, ids);
  }
  throw new Error(`Unknown provider: ${provider.name}`);
}
