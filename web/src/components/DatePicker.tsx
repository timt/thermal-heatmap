import { useCallback, useMemo, useState } from "react";
import type { TrackerStatus } from "@/lib/types";

interface DatePickerProps {
  selectedDate: string;
  processedDates: string[];
  activityDates?: string[];
  onDateChange: (date: string) => void;
  trackerStatus?: TrackerStatus;
}

const DAYS_OF_WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function toISODate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseISO(iso: string): { year: number; month: number } {
  const [year, month] = iso.split("-").map(Number);
  return { year, month: month - 1 };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-based start day (0 = Monday). */
function getStartDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const TRACKER_STATUS_CONFIG: Record<TrackerStatus, { colour: string; tooltip: string }> = {
  ok: { colour: "bg-emerald-400", tooltip: "Live tracking active" },
  "no-data": { colour: "bg-amber-400", tooltip: "Connected — no gliders detected" },
  error: { colour: "bg-red-400", tooltip: "Live tracking unavailable" },
};

export function DatePicker({ selectedDate, processedDates, activityDates, onDateChange, trackerStatus }: DatePickerProps) {
  const fallback = isIsoDate(selectedDate)
    ? parseISO(selectedDate)
    : (() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
      })();
  const [viewYear, setViewYear] = useState(fallback.year);
  const [viewMonth, setViewMonth] = useState(fallback.month);

  const processedSet = useMemo(() => new Set(processedDates), [processedDates]);
  const activitySet = useMemo(() => new Set(activityDates ?? []), [activityDates]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const startDay = getStartDayOfWeek(viewYear, viewMonth);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const days = useMemo(() => {
    const cells: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < startDay; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toISODate(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth, daysInMonth, startDay]);

  const isLive = selectedDate === "live";

  return (
    <div className="rounded-xl bg-gray-900/80 p-3 text-white shadow-lg backdrop-blur-md">
      {/* Live mode button */}
      <button
        type="button"
        onClick={() => onDateChange("live")}
        className={`mb-2 flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition-colors ${
          isLive
            ? "bg-red-500 text-white"
            : "bg-white/10 text-gray-200 hover:bg-white/20"
        }`}
        aria-pressed={isLive}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isLive && trackerStatus
              ? `animate-pulse ${TRACKER_STATUS_CONFIG[trackerStatus].colour}`
              : isLive
                ? "animate-pulse bg-white"
                : "bg-red-400"
          }`}
          title={isLive && trackerStatus ? TRACKER_STATUS_CONFIG[trackerStatus].tooltip : undefined}
        />
        Today (live)
      </button>

      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="min-h-[44px] rounded px-2 py-1 text-sm hover:bg-white/10 md:min-h-0"
          aria-label="Previous month"
        >
          &lsaquo;
        </button>
        <span className="text-sm font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="min-h-[44px] rounded px-2 py-1 text-sm hover:bg-white/10 md:min-h-0"
          aria-label="Next month"
        >
          &rsaquo;
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
        {days.map((cell, i) => {
          if (cell === null) {
            return <div key={`empty-${i}`} />;
          }
          const isSelected = cell.iso === selectedDate;
          const isProcessed = processedSet.has(cell.iso);
          const hasActivity = activitySet.has(cell.iso);

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onDateChange(cell.iso)}
              className={`relative min-h-[44px] rounded py-1 transition-colors md:min-h-0 ${
                isSelected
                  ? "bg-blue-500 font-bold text-white"
                  : "hover:bg-white/10"
              }`}
            >
              {cell.day}
              {(isProcessed || hasActivity) && (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected
                      ? "bg-white"
                      : isProcessed
                        ? "bg-emerald-400"
                        : "bg-amber-400"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
