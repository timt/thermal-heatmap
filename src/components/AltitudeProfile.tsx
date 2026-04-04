"use client";

import type { ThermalData } from "@/components/MapView";
import type { UnitSystem } from "@/lib/units";
import { formatAltitude } from "@/lib/units";

interface AltitudeProfileProps {
  readonly thermals: readonly ThermalData[];
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly units: UnitSystem;
}

const M_TO_FT = 3.28084;
const BIN_SIZE_METRIC = 200; // metres
const BIN_SIZE_UK = 500; // feet

function buildBins(
  values: readonly number[],
  units: UnitSystem,
): readonly { readonly label: string; readonly count: number }[] {
  if (values.length === 0) return [];

  const binSize = units === "uk" ? BIN_SIZE_UK : BIN_SIZE_METRIC;
  const converted = values.map((v) => (units === "uk" ? v * M_TO_FT : v));

  const min = Math.floor(Math.min(...converted) / binSize) * binSize;
  const max = Math.ceil(Math.max(...converted) / binSize) * binSize;

  const bins: { label: string; count: number }[] = [];
  for (let start = min; start < max; start += binSize) {
    const end = start + binSize;
    const count = converted.filter((v) => v >= start && v < end).length;
    const unit = units === "uk" ? "ft" : "m";
    bins.push({ label: `${start.toLocaleString()}-${end.toLocaleString()} ${unit}`, count });
  }

  return bins;
}

function Histogram({
  title,
  bins,
  colour,
}: {
  readonly title: string;
  readonly bins: readonly { readonly label: string; readonly count: number }[];
  readonly colour: string;
}) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const barHeight = 16;
  const gap = 2;
  const labelWidth = 120;
  const chartWidth = 140;
  const svgHeight = bins.length * (barHeight + gap);

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-300">{title}</div>
      <svg
        width={labelWidth + chartWidth}
        height={svgHeight}
        className="overflow-visible"
      >
        {bins.map((bin, i) => {
          const y = i * (barHeight + gap);
          const barWidth = (bin.count / maxCount) * chartWidth;
          return (
            <g key={bin.label}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-gray-400 text-[10px]"
              >
                {bin.label}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={Math.max(barWidth, 1)}
                height={barHeight}
                rx={2}
                fill={colour}
                opacity={0.7}
              />
              {bin.count > 0 && (
                <text
                  x={labelWidth + barWidth + 4}
                  y={y + barHeight / 2}
                  dominantBaseline="central"
                  className="fill-gray-300 text-[10px]"
                >
                  {bin.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AltitudeProfile({
  thermals,
  isCollapsed,
  onToggleCollapse,
  units,
}: AltitudeProfileProps) {
  const baseBins = buildBins(
    thermals.map((t) => t.baseAlt),
    units,
  );
  const topBins = buildBins(
    thermals.map((t) => t.topAlt),
    units,
  );

  const medianBase =
    thermals.length > 0
      ? [...thermals.map((t) => t.baseAlt)].sort((a, b) => a - b)[
          Math.floor(thermals.length / 2)
        ]
      : 0;
  const medianTop =
    thermals.length > 0
      ? [...thermals.map((t) => t.topAlt)].sort((a, b) => a - b)[
          Math.floor(thermals.length / 2)
        ]
      : 0;

  return (
    <div className="rounded-xl bg-gray-900/80 p-3 text-white shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full text-left text-xs text-gray-300 hover:text-white"
      >
        {isCollapsed ? (
          <span>
            Altitudes: base {formatAltitude(medianBase, units)}, top{" "}
            {formatAltitude(medianTop, units)}
          </span>
        ) : (
          <span className="font-semibold">Altitude Profile</span>
        )}
      </button>

      {!isCollapsed && thermals.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <Histogram title="Base altitude" bins={baseBins} colour="#3b82f6" />
          <Histogram title="Top altitude" bins={topBins} colour="#ef4444" />
        </div>
      )}

      {!isCollapsed && thermals.length === 0 && (
        <div className="mt-2 text-xs text-gray-500">No thermal data</div>
      )}
    </div>
  );
}
