import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { BGALadderProvider, fetchFlightDetails } from "../src/lib/bga-provider.ts";
import type { NormalisedFlight } from "../src/lib/types.ts";

const FLIGHT_JSON = {
  FlightID: 128982,
  FlightDate: "2026-04-06T00:00:00",
  Pilot: { Fullname: "Jane Soarer" },
  Club: { Name: "Lasham Gliding Society" },
  Glider: { GliderType: "ASW 27", Registration: "G-CKSX" },
  Launchpoint: { Site: "Lasham", Latitude: 51.187, Longitude: -1.033 },
  ScoringDistance: 312.4,
  HandicapSpeed: 87.2,
  TotalPoints: 512,
  LoggerFileAvailable: true,
};

/** Replace global fetch for the duration of one test (auto-restored). */
function mockFetch(
  t: TestContext,
  handler: (url: string) => Response,
) {
  return t.mock.method(
    globalThis,
    "fetch",
    (async (input: string | URL | Request) =>
      handler(String(input))) as typeof fetch,
  );
}

describe("BGALadderProvider.getFlightIds", () => {
  it("requests the BGA date format (DD-Mon-YYYY) and stringifies ids", async (t) => {
    const fetchMock = mockFetch(t, (url) => {
      assert.ok(url.endsWith("/API/FLIGHTIDS/06-Apr-2026"), `unexpected URL: ${url}`);
      return Response.json([128982, 128983]);
    });

    const ids = await new BGALadderProvider().getFlightIds("2026-04-06");

    assert.deepEqual(ids, ["128982", "128983"]);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it("throws when the listing request fails", async (t) => {
    mockFetch(t, () => new Response("", { status: 503, statusText: "Service Unavailable" }));

    await assert.rejects(
      new BGALadderProvider().getFlightIds("2026-04-06"),
      /BGA FLIGHTIDS failed: 503/,
    );
  });
});

describe("BGALadderProvider.getFlightDetail", () => {
  it("normalises the BGA flight payload", async (t) => {
    mockFetch(t, () => Response.json(FLIGHT_JSON));

    const flight = await new BGALadderProvider().getFlightDetail("128982");

    assert.deepEqual(flight, {
      id: "bga:128982",
      source: "bga",
      date: "2026-04-06",
      pilot: "Jane Soarer",
      club: "Lasham Gliding Society",
      aircraft: "ASW 27",
      registration: "G-CKSX",
      launchSite: "Lasham",
      region: "GB",
      launchLat: 51.187,
      launchLon: -1.033,
      distance: 312.4,
      speed: 87.2,
      points: 512,
      sourceUrl: "https://www.bgaladder.net/Flight/128982",
      hasTrackData: true,
    } satisfies NormalisedFlight);
  });

  it("maps a zero handicap speed to null", async (t) => {
    mockFetch(t, () => Response.json({ ...FLIGHT_JSON, HandicapSpeed: 0 }));

    const flight = await new BGALadderProvider().getFlightDetail("128982");
    assert.equal(flight.speed, null);
  });
});

describe("BGALadderProvider.getTrackPoints", () => {
  it("parses IGC content into track points", async (t) => {
    const igc = "HFDTE060426\nB1101355206343N00006198WA0058700558\n";
    mockFetch(t, () => new Response(igc));

    const result = await new BGALadderProvider().getTrackPoints("128982");

    assert.equal(result.status, "ok");
    assert.equal(result.status === "ok" && result.points.length, 1);
  });

  it("returns a failed result (not a throw) on an HTTP error", async (t) => {
    mockFetch(t, () => new Response("", { status: 404 }));

    const result = await new BGALadderProvider().getTrackPoints("128982");

    assert.deepEqual(result, {
      status: "failed",
      reason: "BGA IGC fetch returned 404",
    });
  });

  it("returns a failed result when the fetch itself rejects", async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      (async () => {
        throw new Error("network down");
      }) as typeof fetch,
    );

    const result = await new BGALadderProvider().getTrackPoints("128982");

    assert.deepEqual(result, {
      status: "failed",
      reason: "BGA IGC fetch error: network down",
    });
  });
});

describe("fetchFlightDetails", () => {
  const stubFlight = (id: string): NormalisedFlight => ({
    id: `bga:${id}`,
    source: "bga",
    date: "2026-04-06",
    pilot: "Stub Pilot",
    club: "Stub Club",
    aircraft: "K21",
    registration: null,
    launchSite: "Lasham",
    region: "GB",
    launchLat: 51.187,
    launchLon: -1.033,
    distance: 0,
    speed: null,
    points: null,
    sourceUrl: `https://www.bgaladder.net/Flight/${id}`,
    hasTrackData: false,
  });

  /** Provider stub: ids prefixed "bad" reject, others resolve. */
  class StubProvider extends BGALadderProvider {
    calls: string[] = [];

    override async getFlightDetail(id: string): Promise<NormalisedFlight> {
      this.calls.push(id);
      if (id.startsWith("bad")) throw new Error(`boom ${id}`);
      return stubFlight(id);
    }
  }

  it("returns details for every id, preserving order", async () => {
    const provider = new StubProvider();
    const results = await fetchFlightDetails(provider, ["1", "2", "3"], 2);

    assert.deepEqual(results.map((f) => f.id), ["bga:1", "bga:2", "bga:3"]);
    assert.deepEqual(provider.calls, ["1", "2", "3"]);
  });

  it("silently drops flights whose detail fetch fails", async () => {
    const provider = new StubProvider();
    const results = await fetchFlightDetails(provider, ["1", "bad2", "3"], 10);

    assert.deepEqual(results.map((f) => f.id), ["bga:1", "bga:3"]);
  });

  it("returns an empty list for no ids", async () => {
    const provider = new StubProvider();
    assert.deepEqual(await fetchFlightDetails(provider, []), []);
    assert.deepEqual(provider.calls, []);
  });
});
