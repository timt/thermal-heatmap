"use client";

interface StatsPanelProps {
  flightsAnalysed: number;
  thermalsDetected: number;
  avgClimbRate: number;
  bestClimbRate: number;
  maxAltGain: number;
  highestTop: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function StatsPanel({
  flightsAnalysed,
  thermalsDetected,
  avgClimbRate,
  bestClimbRate,
  maxAltGain,
  highestTop,
  isCollapsed,
  onToggleCollapse,
}: StatsPanelProps) {
  return (
    <div className="rounded-xl bg-gray-900/80 p-3 text-white shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full text-left text-xs text-gray-300 hover:text-white"
      >
        {isCollapsed ? (
          <span>
            {flightsAnalysed} flights, {thermalsDetected} thermals, best{" "}
            {bestClimbRate.toFixed(1)} m/s
          </span>
        ) : (
          <span className="font-semibold">Statistics</span>
        )}
      </button>

      {!isCollapsed && (
        <div className="mt-2 flex flex-col gap-1">
          <StatRow label="Flights analysed" value={String(flightsAnalysed)} />
          <StatRow label="Thermals detected" value={String(thermalsDetected)} />
          <StatRow label="Avg climb rate" value={`${avgClimbRate.toFixed(1)} m/s`} />
          <StatRow label="Best climb rate" value={`${bestClimbRate.toFixed(1)} m/s`} />
          <StatRow label="Max altitude gain" value={`${maxAltGain.toLocaleString()} m`} />
          <StatRow label="Highest top" value={`${highestTop.toLocaleString()} m`} />
        </div>
      )}
    </div>
  );
}
