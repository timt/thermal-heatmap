import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_SOURCES,
  isValidSource,
  getProvider,
  fetchFlightDetailsForSource,
} from "../src/lib/provider-factory.ts";
import { BGALadderProvider } from "../src/lib/bga-provider.ts";
import { WeGlideProvider } from "../src/lib/weglide-provider.ts";
import type { FlightSourceProvider } from "../src/lib/types.ts";

describe("isValidSource", () => {
  it("accepts the known sources", () => {
    for (const source of VALID_SOURCES) {
      assert.equal(isValidSource(source), true);
    }
  });

  it("rejects unknown and empty sources", () => {
    assert.equal(isValidSource("ogn"), false);
    assert.equal(isValidSource("BGA"), false); // case-sensitive
    assert.equal(isValidSource(""), false);
  });
});

describe("getProvider", () => {
  it("returns a BGA provider for 'bga'", () => {
    const provider = getProvider("bga");
    assert.ok(provider instanceof BGALadderProvider);
    assert.equal(provider.name, "bga");
  });

  it("returns a WeGlide provider for 'weglide'", () => {
    const provider = getProvider("weglide");
    assert.ok(provider instanceof WeGlideProvider);
    assert.equal(provider.name, "weglide");
  });
});

describe("fetchFlightDetailsForSource", () => {
  it("rejects a provider it does not recognise", async () => {
    const unknown: FlightSourceProvider = {
      name: "mystery",
      getFlightIds: async () => [],
      getFlightDetail: async () => {
        throw new Error("not implemented");
      },
      getTrackPoints: async () => ({ status: "failed", reason: "n/a" }),
    };

    await assert.rejects(
      fetchFlightDetailsForSource(unknown, ["1"]),
      /Unknown provider: mystery/,
    );
  });
});
