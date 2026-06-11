import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectThermals, DEFAULT_PARAMS } from "../src/lib/thermal-detector.ts";
import type { TrackPoint, ThermalDetectionParams } from "../src/lib/types.ts";

/** Detection params with no resampling, sized for short synthetic tracks. */
const PARAMS: Partial<ThermalDetectionParams> = {
  sampleRate: 1,
  windowSize: 5,
  minClimbRate: 0.5,
  minHeadingChange: 180,
  extensionClimbFactor: 0.3,
  minAltGain: 30,
};

const T0 = 1_750_000_000; // arbitrary epoch seconds

/**
 * A circling climb: points every 10 s stepping 90° around a small circle,
 * climbing at `climbRate` m/s. A five-point window therefore turns through
 * a full 360°, comfortably past the 180° heading threshold.
 */
function circlingClimb(opts: {
  centreLat: number;
  centreLon: number;
  count: number;
  startAlt: number;
  climbRate?: number;
  startTime?: number;
}): TrackPoint[] {
  const { centreLat, centreLon, count, startAlt } = opts;
  const climbRate = opts.climbRate ?? 1;
  const startTime = opts.startTime ?? T0;
  const radius = 0.001; // degrees, ~100 m
  return Array.from({ length: count }, (_, k) => {
    const angle = (k * 90 * Math.PI) / 180;
    return {
      lat: centreLat + radius * Math.cos(angle),
      lon: centreLon + radius * Math.sin(angle),
      alt: startAlt + climbRate * 10 * k,
      time: startTime + 10 * k,
    };
  });
}

describe("detectThermals", () => {
  it("detects a single circling climb with exact altitude and timing values", () => {
    // 12 points = three full circles, 1 m/s climb from 1000 m.
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 12,
      startAlt: 1000,
    });

    const thermals = detectThermals(track, PARAMS);

    assert.equal(thermals.length, 1);
    const t = thermals[0];
    assert.equal(t.baseAlt, 1000);
    assert.equal(t.topAlt, 1110); // 11 steps × 10 m
    assert.equal(t.altGain, 110);
    assert.equal(t.entryTime, T0);
    assert.equal(t.exitTime, T0 + 110);
    assert.equal(t.avgClimbRate, 1); // 110 m / 110 s
  });

  it("places the centroid at the circle centre", () => {
    // Full circles of equally spaced points average to the centre.
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 12,
      startAlt: 1000,
    });

    const [t] = detectThermals(track, PARAMS);
    assert.ok(Math.abs(t.lat - 52) < 1e-6);
    assert.ok(Math.abs(t.lon - -1) < 1e-6);
  });

  it("ignores a straight-line climb (no circling)", () => {
    const track: TrackPoint[] = Array.from({ length: 12 }, (_, k) => ({
      lat: 52 + 0.001 * k, // due north, constant heading
      lon: -1,
      alt: 1000 + 10 * k, // climbing at 1 m/s
      time: T0 + 10 * k,
    }));

    assert.deepEqual(detectThermals(track, PARAMS), []);
  });

  it("ignores circling at constant altitude", () => {
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 12,
      startAlt: 1000,
      climbRate: 0,
    });

    assert.deepEqual(detectThermals(track, PARAMS), []);
  });

  it("ignores circling descent", () => {
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 12,
      startAlt: 1000,
      climbRate: -1,
    });

    assert.deepEqual(detectThermals(track, PARAMS), []);
  });

  it("rejects a climb below minAltGain", () => {
    // 5 points gaining 40 m — below a 50 m threshold.
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 5,
      startAlt: 1000,
    });

    assert.deepEqual(detectThermals(track, { ...PARAMS, minAltGain: 50 }), []);
  });

  it("returns no thermals for an empty track", () => {
    assert.deepEqual(detectThermals([], PARAMS), []);
    assert.deepEqual(detectThermals([]), []);
  });

  it("returns no thermals when there are fewer points than the window", () => {
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 4, // windowSize is 5
      startAlt: 1000,
    });

    assert.deepEqual(detectThermals(track, PARAMS), []);
  });

  it("counts points after resampling against the window size", () => {
    // Default params: sampleRate 4, windowSize 8 → 28 points resample to 7.
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 28,
      startAlt: 1000,
    });

    assert.equal(DEFAULT_PARAMS.sampleRate, 4);
    assert.equal(DEFAULT_PARAMS.windowSize, 8);
    assert.deepEqual(detectThermals(track), []);
  });

  it("sorts unordered input by time before detecting", () => {
    const track = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 12,
      startAlt: 1000,
    });
    const shuffled = [...track].reverse();

    const thermals = detectThermals(shuffled, PARAMS);
    assert.equal(thermals.length, 1);
    assert.equal(thermals[0].altGain, 110);
  });

  it("handles duplicate timestamps without dividing by zero", () => {
    const point = { lat: 52, lon: -1, alt: 1000, time: T0 };
    const track = Array.from({ length: 10 }, () => ({ ...point }));

    assert.deepEqual(detectThermals(track, PARAMS), []);
  });

  it("detects two thermals separated by a glide", () => {
    const first = circlingClimb({
      centreLat: 52,
      centreLon: -1,
      count: 8,
      startAlt: 1000,
    });
    // Straight descending glide for 6 points, 10 s apart.
    const glide: TrackPoint[] = Array.from({ length: 6 }, (_, k) => ({
      lat: 52,
      lon: -1 + 0.005 * (k + 1),
      alt: 1070 - 10 * (k + 1),
      time: T0 + 80 + 10 * k,
    }));
    const second = circlingClimb({
      centreLat: 52,
      centreLon: -0.9,
      count: 8,
      startAlt: 1020,
      startTime: T0 + 140,
    });

    const thermals = detectThermals([...first, ...glide, ...second], PARAMS);

    assert.equal(thermals.length, 2);
    assert.ok(thermals[0].exitTime < thermals[1].entryTime);
    assert.equal(thermals[0].baseAlt, 1000);
    // The second detection may start a point or two before the circle proper,
    // but must top out at the second climb's ceiling.
    assert.equal(thermals[1].topAlt, 1090);
  });
});
