import type { UnitSystem } from "@/lib/units";
import { formatClimbRate, formatAltitude } from "@/lib/units";

interface StatsPanelProps {
  readonly flightsAnalysed: number;
  readonly thermalsDetected: number;
  readonly avgClimbRate: number;
  readonly bestClimbRate: number;
  readonly maxAltGain: number;
  readonly highestTop: number;
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly units: UnitSystem;
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
  units,
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
            {formatClimbRate(bestClimbRate, units)}
          </span>
        ) : (
          <span className="font-semibold">Statistics</span>
        )}
      </button>

      {!isCollapsed && (
        <div className="mt-2 flex flex-col gap-1">
          <StatRow label="Flights analysed" value={String(flightsAnalysed)} />
          <StatRow label="Thermals detected" value={String(thermalsDetected)} />
          <StatRow label="Avg climb rate" value={formatClimbRate(avgClimbRate, units)} />
          <StatRow label="Best climb rate" value={formatClimbRate(bestClimbRate, units)} />
          <StatRow label="Max altitude gain" value={formatAltitude(maxAltGain, units)} />
          <StatRow label="Highest top" value={formatAltitude(highestTop, units)} />
        </div>
      )}
    </div>
  );
}
