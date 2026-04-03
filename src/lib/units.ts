export type UnitSystem = "metric" | "uk";

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

export function formatClimbRate(ms: number, units: UnitSystem): string {
  if (units === "uk") return `${(ms * MS_TO_KT).toFixed(1)} kt`;
  return `${ms.toFixed(1)} m/s`;
}

export function formatAltitude(metres: number, units: UnitSystem): string {
  if (units === "uk") return `${Math.round(metres * M_TO_FT).toLocaleString()} ft`;
  return `${metres.toLocaleString()} m`;
}

export function toDisplayClimbRate(ms: number, units: UnitSystem): number {
  return units === "uk" ? ms * MS_TO_KT : ms;
}

export function fromDisplayClimbRate(display: number, units: UnitSystem): number {
  return units === "uk" ? display / MS_TO_KT : display;
}

export const climbRateSliderConfig = {
  metric: { min: 0, max: 3, step: 0.1, unit: "m/s" },
  uk: { min: 0, max: 6, step: 0.5, unit: "kt" },
} as const;
