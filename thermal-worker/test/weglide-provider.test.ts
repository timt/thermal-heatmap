import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  WeGlideProvider,
  fetchWeGlideFlightDetails,
} from "../src/lib/weglide-provider.ts";

const PAGE_LIMIT = 100; // mirrors the provider's page size

function weGlideFlight(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user: { id: 1, name: "Jane Soarer" },
    takeoff_airport: { id: 10, name: "Lasham", region: "GB" },
    aircraft: { id: 20, name: "ASW 27" },
    club: { id: 30, name: "Lasham Gliding Society" },
    takeoff_time: "2026-04-06T10:00:00Z",
    landing_time: "2026-04-06T15:00:00Z",
    scoring_date: "2026-04-06",
    bbox: [-1.2, 51.0, -0.8, 51.4],
    contest: { points: 412, distance: 305.7, speed: 92.1 },
    ...overrides,
  };
}

/** Replace global fetch for the duration of one test (auto-restored). */
function mockFetch(t: TestContext, handler: (url: string) => Response) {
  return t.mock.method(
    globalThis,
    "fetch",
    (async (input: string | URL | Request) =>
      handler(String(input))) as typeof fetch,
  );
}

describe("WeGlideProvider.getFlightIds", () => {
  it("returns ids from a single page as strings", async (t) => {
    mockFetch(t, () => Response.json([weGlideFlight(1), weGlideFlight(2)]));

    const ids = await new WeGlideProvider().getFlightIds("2026-04-06");
    assert.deepEqual(ids, ["1", "2"]);
  });

  it("paginates until a short page is returned", async (t) => {
    const fetchMock = mockFetch(t, (url) => {
      const skip = Number(new URL(url).searchParams.get("skip"));
      if (skip === 0) {
        return Response.json(
          Array.from({ length: PAGE_LIMIT }, (_, i) => weGlideFlight(i + 1)),
        );
      }
      return Response.json([weGlideFlight(PAGE_LIMIT + 1)]);
    });

    const ids = await new WeGlideProvider().getFlightIds("2026-04-06");

    assert.equal(ids.length, PAGE_LIMIT + 1);
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it("caches the flight list so a second call does not re-fetch", async (t) => {
    const fetchMock = mockFetch(t, () => Response.json([weGlideFlight(1)]));

    const provider = new WeGlideProvider();
    await provider.getFlightIds("2026-04-06");
    await provider.getFlightIds("2026-04-06");

    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("throws when the listing request fails", async (t) => {
    mockFetch(t, () => new Response("", { status: 429, statusText: "Too Many Requests" }));

    await assert.rejects(
      new WeGlideProvider().getFlightIds("2026-04-06"),
      /WeGlide flight list failed: 429/,
    );
  });
});

describe("WeGlideProvider.getFlightDetail", () => {
  it("normalises a cached flight, deriving launch coords from the bbox centre", async (t) => {
    mockFetch(t, () => Response.json([weGlideFlight(42)]));

    const provider = new WeGlideProvider();
    await provider.getFlightIds("2026-04-06");
    const flight = await provider.getFlightDetail("42");

    assert.deepEqual(flight, {
      id: "weglide:42",
      source: "weglide",
      date: "2026-04-06",
      pilot: "Jane Soarer",
      club: "Lasham Gliding Society",
      aircraft: "ASW 27",
      registration: null,
      launchSite: "Lasham",
      region: "GB",
      launchLat: 51.2, // (51.0 + 51.4) / 2
      launchLon: -1, // (-1.2 + -0.8) / 2
      distance: 305.7,
      speed: 92.1,
      points: 412,
      sourceUrl: "https://www.weglide.org/flight/42",
      hasTrackData: true,
    });
  });

  it("maps a zero contest speed and missing club to null/empty", async (t) => {
    mockFetch(t, () =>
      Response.json([
        weGlideFlight(42, {
          club: null,
          contest: { points: 0, distance: 10, speed: 0 },
        }),
      ]),
    );

    const provider = new WeGlideProvider();
    await provider.getFlightIds("2026-04-06");
    const flight = await provider.getFlightDetail("42");

    assert.equal(flight.speed, null);
    assert.equal(flight.club, "");
  });

  it("rejects when the flight is not in the cache", async () => {
    await assert.rejects(
      new WeGlideProvider().getFlightDetail("999"),
      /WeGlide flight 999 not found in cache/,
    );
  });
});

describe("WeGlideProvider.getTrackPoints", () => {
  it("samples coordinates evenly to match the time/alt arrays", async (t) => {
    // 5 coordinates, 3 samples → indices 0, 2, 4.
    mockFetch(t, () =>
      Response.json({
        geom: {
          coordinates: [
            [-1.0, 51.0],
            [-1.1, 51.1],
            [-1.2, 51.2],
            [-1.3, 51.3],
            [-1.4, 51.4],
          ],
        },
        time: [1000, 1010, 1020],
        alt: [300, 320, 340],
      }),
    );

    const result = await new WeGlideProvider().getTrackPoints("42");

    assert.deepEqual(result, {
      status: "ok",
      points: [
        { lat: 51.0, lon: -1.0, alt: 300, time: 1000 },
        { lat: 51.2, lon: -1.2, alt: 320, time: 1010 },
        { lat: 51.4, lon: -1.4, alt: 340, time: 1020 },
      ],
    });
  });

  it("returns a failed result (not a throw) on an HTTP error", async (t) => {
    mockFetch(t, () => new Response("", { status: 404 }));

    const result = await new WeGlideProvider().getTrackPoints("42");

    assert.deepEqual(result, {
      status: "failed",
      reason: "WeGlide track fetch returned 404",
    });
  });
});

describe("fetchWeGlideFlightDetails", () => {
  it("skips ids missing from the cache and keeps the rest", async (t) => {
    mockFetch(t, () => Response.json([weGlideFlight(1), weGlideFlight(3)]));

    const provider = new WeGlideProvider();
    await provider.getFlightIds("2026-04-06");
    const results = await fetchWeGlideFlightDetails(provider, ["1", "2", "3"]);

    assert.deepEqual(results.map((f) => f.id), ["weglide:1", "weglide:3"]);
  });

  it("returns an empty list for no ids", async () => {
    assert.deepEqual(await fetchWeGlideFlightDetails(new WeGlideProvider(), []), []);
  });
});
