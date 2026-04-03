"use client";

import type { UnitSystem } from "@/lib/units";

interface UnitToggleProps {
  readonly units: UnitSystem;
  readonly onChange: (units: UnitSystem) => void;
}

export function UnitToggle({ units, onChange }: UnitToggleProps) {
  return (
    <div className="rounded-xl bg-gray-900/80 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => onChange("uk")}
          className={`rounded px-2 py-1 ${
            units === "uk" ? "bg-blue-600 font-semibold" : "text-gray-400 hover:text-white"
          }`}
        >
          kt / ft
        </button>
        <button
          type="button"
          onClick={() => onChange("metric")}
          className={`rounded px-2 py-1 ${
            units === "metric" ? "bg-blue-600 font-semibold" : "text-gray-400 hover:text-white"
          }`}
        >
          m/s / m
        </button>
      </div>
    </div>
  );
}
