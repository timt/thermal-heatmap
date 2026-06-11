import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseIgc } from "../src/lib/igc-parser.ts";

// B-record: B HHMMSS DDMMmmmN DDDMMmmmW A PPPPP GGGGG
// 11:01:35, 52°06.343'N, 000°06.198'W, valid, press 587m, GPS 558m
const B_RECORD = "B1101355206343N00006198WA0058700558";

const utc = (
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
) => Math.floor(Date.UTC(y, mo - 1, d, h, mi, s) / 1000);

describe("parseIgc", () => {
  it("parses a valid B-record into lat/lon/alt/time", () => {
    const content = `HFDTE060426\n${B_RECORD}\n`;
    const points = parseIgc(content, "1970-01-01");

    assert.equal(points.length, 1);
    const p = points[0];
    // 52 + (6 + 343/1000) / 60
    assert.ok(Math.abs(p.lat - 52.10571666666667) < 1e-9);
    // -(0 + (6 + 198/1000) / 60) — west is negative
    assert.ok(Math.abs(p.lon - -0.1033) < 1e-9);
    assert.equal(p.alt, 558); // GPS altitude preferred
    assert.equal(p.time, utc(2026, 4, 6, 11, 1, 35));
  });

  it("uses the HFDTEDATE:DDMMYY header variant", () => {
    const content = `HFDTEDATE:060426\n${B_RECORD}\n`;
    const points = parseIgc(content, "1970-01-01");
    assert.equal(points[0].time, utc(2026, 4, 6, 11, 1, 35));
  });

  it("falls back to the supplied date when no HFDTE header exists", () => {
    const points = parseIgc(`${B_RECORD}\n`, "2026-04-06");
    assert.equal(points[0].time, utc(2026, 4, 6, 11, 1, 35));
  });

  it("maps two-digit years 80-99 to the 1900s (IGC convention)", () => {
    const content = `HFDTE311299\n${B_RECORD}\n`;
    const points = parseIgc(content, "1970-01-01");
    assert.equal(points[0].time, utc(1999, 12, 31, 11, 1, 35));
  });

  it("filters out fixes flagged invalid (validity V)", () => {
    const invalid = "B1101355206343N00006198WV0058700558";
    const points = parseIgc(`HFDTE060426\n${invalid}\n${B_RECORD}\n`, "");
    assert.equal(points.length, 1);
  });

  it("falls back to pressure altitude when GPS altitude is 0", () => {
    const record = "B1101355206343N00006198WA0058700000";
    const points = parseIgc(`HFDTE060426\n${record}\n`, "");
    assert.equal(points[0].alt, 587);
  });

  it("parses negative pressure altitude", () => {
    const record = "B1101355206343N00006198WA-012300000";
    const points = parseIgc(`HFDTE060426\n${record}\n`, "");
    assert.equal(points[0].alt, -123);
  });

  it("handles southern and eastern hemispheres", () => {
    const record = "B1101353330000S15130000EA0058700558";
    const points = parseIgc(`HFDTE060426\n${record}\n`, "");
    assert.ok(Math.abs(points[0].lat - -33.5) < 1e-9); // 33°30.000'S
    assert.ok(Math.abs(points[0].lon - 151.5) < 1e-9); // 151°30.000'E
  });

  it("sorts points by time", () => {
    const later = "B1201355206343N00006198WA0058700558";
    const points = parseIgc(`HFDTE060426\n${later}\n${B_RECORD}\n`, "");
    assert.equal(points.length, 2);
    assert.ok(points[0].time < points[1].time);
  });

  it("ignores non-B records and malformed B lines", () => {
    const content = [
      "AXCSFLY Flymaster",
      "HFDTE060426",
      "LCONV-VER:4.2",
      "Bgarbage",
      B_RECORD,
      "GSECURITYRECORD",
    ].join("\n");
    const points = parseIgc(content, "");
    assert.equal(points.length, 1);
  });

  it("returns an empty array for content with no B-records", () => {
    assert.deepEqual(parseIgc("HFDTE060426\n", "2026-04-06"), []);
  });

  it("handles CRLF line endings", () => {
    const points = parseIgc(`HFDTE060426\r\n${B_RECORD}\r\n`, "");
    assert.equal(points.length, 1);
  });
});
