"use client";

interface ClimbRateSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function ClimbRateSlider({ value, onChange }: ClimbRateSliderProps) {
  return (
    <div className="rounded-xl bg-gray-900/80 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <label className="mb-1 block text-xs font-semibold text-gray-300">
        Min climb: {value.toFixed(1)} m/s
      </label>
      <input
        type="range"
        min={0}
        max={3}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-48 cursor-pointer appearance-none rounded-full bg-gray-700 accent-blue-500"
      />
    </div>
  );
}
