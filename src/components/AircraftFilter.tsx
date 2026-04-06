"use client";

import { useMemo } from "react";
import type { ThermalData } from "@/components/MapView";

interface AircraftFilterProps {
  readonly thermals: readonly ThermalData[];
  readonly selectedAircraft: string | null;
  readonly selectedRegistration: string | null;
  readonly onAircraftChange: (aircraft: string | null) => void;
  readonly onRegistrationChange: (registration: string | null) => void;
}

export function AircraftFilter({
  thermals,
  selectedAircraft,
  selectedRegistration,
  onAircraftChange,
  onRegistrationChange,
}: AircraftFilterProps) {
  const aircraftTypes = useMemo(
    () =>
      [...new Set(thermals.map((t) => t.aircraft).filter(Boolean))]
        .sort() as string[],
    [thermals],
  );

  const registrations = useMemo(() => {
    const filtered = selectedAircraft
      ? thermals.filter((t) => t.aircraft === selectedAircraft)
      : thermals;
    return [
      ...new Set(
        filtered
          .map((t) => t.registration)
          .filter((r): r is string => r != null && r !== ""),
      ),
    ].sort();
  }, [thermals, selectedAircraft]);

  const hasData = aircraftTypes.length > 0;

  return (
    <div className="rounded-xl bg-gray-900/80 p-3 text-white shadow-lg backdrop-blur-md">
      <div className="mb-2 text-xs font-semibold">Aircraft Filter</div>

      {!hasData ? (
        <div className="text-xs text-gray-500">No aircraft data available</div>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Type</label>
            <select
              value={selectedAircraft ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                onAircraftChange(val);
                onRegistrationChange(null);
              }}
              className="w-full rounded-lg bg-gray-800/80 px-2 py-1.5 text-xs text-gray-300"
            >
              <option value="">All types ({aircraftTypes.length})</option>
              {aircraftTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">Registration</label>
            <select
              value={selectedRegistration ?? ""}
              onChange={(e) => onRegistrationChange(e.target.value || null)}
              className="w-full rounded-lg bg-gray-800/80 px-2 py-1.5 text-xs text-gray-300"
            >
              <option value="">All registrations ({registrations.length})</option>
              {registrations.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          {(selectedAircraft || selectedRegistration) && (
            <button
              type="button"
              onClick={() => {
                onAircraftChange(null);
                onRegistrationChange(null);
              }}
              className="mt-1 rounded-lg bg-gray-800/80 px-2 py-1.5 text-xs text-gray-400 hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
