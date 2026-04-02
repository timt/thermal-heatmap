"use client";

import { useMemo } from "react";

interface CacheFreshnessProps {
  processedAt: string | null;
  flightCount: number;
  newFlightsAvailable: number;
  onRefresh: () => void;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CacheFreshness({
  processedAt,
  flightCount,
  newFlightsAvailable,
  onRefresh,
}: CacheFreshnessProps) {
  const relativeTime = useMemo(
    () => (processedAt ? formatRelativeTime(processedAt) : null),
    [processedAt],
  );

  if (!processedAt) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-900/80 px-3 py-1.5 text-xs text-gray-300 shadow-lg backdrop-blur-md">
      <span>
        Last processed: {relativeTime} &ndash; {flightCount} flights
      </span>
      {newFlightsAvailable > 0 && (
        <>
          <span className="text-amber-400">
            {newFlightsAvailable} new flight{newFlightsAvailable !== 1 ? "s" : ""} available
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Refresh
          </button>
        </>
      )}
    </div>
  );
}
