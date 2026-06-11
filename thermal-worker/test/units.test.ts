import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatClimbRate,
  formatAltitude,
  toDisplayClimbRate,
  fromDisplayClimbRate,
  climbRateSliderConfig,
} from "../src/lib/units.ts";

describe("formatClimbRate", () => {
  it("formats metric to one decimal place in m/s", () => {
    assert.equal(formatClimbRate(2, "metric"), "2.0 m/s");
    assert.equal(formatClimbRate(1.25, "metric"), "1.3 m/s");
  });

  it("converts to knots for UK units (1 m/s = 1.94384 kt)", () => {
    assert.equal(formatClimbRate(2, "uk"), "3.9 kt");
    assert.equal(formatClimbRate(0, "uk"), "0.0 kt");
  });
});

describe("formatAltitude", () => {
  it("formats metres for metric units", () => {
    assert.equal(formatAltitude(500, "metric"), "500 m");
  });

  it("converts to rounded feet for UK units (1 m = 3.28084 ft)", () => {
    assert.equal(formatAltitude(100, "uk"), "328 ft");
    assert.equal(formatAltitude(0, "uk"), "0 ft");
  });
});

describe("display climb-rate conversion", () => {
  it("is the identity for metric", () => {
    assert.equal(toDisplayClimbRate(1.5, "metric"), 1.5);
    assert.equal(fromDisplayClimbRate(1.5, "metric"), 1.5);
  });

  it("converts m/s to kt and back for UK units", () => {
    assert.equal(toDisplayClimbRate(2, "uk"), 3.88768);
    assert.ok(Math.abs(fromDisplayClimbRate(3.88768, "uk") - 2) < 1e-12);
  });

  it("round-trips any value", () => {
    for (const v of [0, 0.5, 1.7, 3]) {
      assert.ok(Math.abs(fromDisplayClimbRate(toDisplayClimbRate(v, "uk"), "uk") - v) < 1e-12);
    }
  });
});

describe("climbRateSliderConfig", () => {
  it("exposes matching units for each system", () => {
    assert.equal(climbRateSliderConfig.metric.unit, "m/s");
    assert.equal(climbRateSliderConfig.uk.unit, "kt");
  });

  it("covers an equivalent range in both systems (3 m/s ≈ 5.8 kt)", () => {
    // The UK max of 6 kt should be at least the metric max converted.
    assert.ok(climbRateSliderConfig.uk.max >= toDisplayClimbRate(climbRateSliderConfig.metric.max, "uk"));
  });
});
