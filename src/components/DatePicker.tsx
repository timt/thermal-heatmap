"use client";

import { useCallback, useMemo, useState } from "react";

interface DatePickerProps {
  selectedDate: string;
  processedDates: string[];
  activityDates?: string[];
  onDateChange: (date: string) => void;
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

export function DatePicker({ selectedDate, processedDates, activityDates, onDateChange }: DatePickerProps) {
  const { year: selYear, month: selMonth } = parseISO(selectedDate);
  const [viewYear, setViewYear] = useState(selYear);
  const [viewMonth, setViewMonth] = useState(selMonth);

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

  return (
    <div className="rounded-xl bg-gray-900/80 p-3 text-white shadow-lg backdrop-blur-md">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded px-2 py-1 text-sm hover:bg-white/10"
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
          className="rounded px-2 py-1 text-sm hover:bg-white/10"
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
              className={`relative rounded py-1 transition-colors ${
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
