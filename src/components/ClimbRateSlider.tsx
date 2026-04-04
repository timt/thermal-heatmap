"use client";

import type { UnitSystem } from "@/lib/units";
import { toDisplayClimbRate, fromDisplayClimbRate, climbRateSliderConfig } from "@/lib/units";

interface ClimbRateSliderProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly units: UnitSystem;
}

export function ClimbRateSlider({ value, onChange, units }: ClimbRateSliderProps) {
  const config = climbRateSliderConfig[units];
  const displayValue = toDisplayClimbRate(value, units);

  return (
    <div className="rounded-xl bg-gray-900/80 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <label className="mb-1 block text-xs font-semibold text-gray-300">
        Min climb: {displayValue.toFixed(units === "uk" ? 1 : 1)} {config.unit}
      </label>
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={displayValue}
        onChange={(e) => onChange(fromDisplayClimbRate(parseFloat(e.target.value), units))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-700 accent-blue-500 md:w-48"
      />
    </div>
  );
}
