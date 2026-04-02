"use client";

interface ProcessingProgressProps {
  currentFlight: number;
  totalFlights: number;
  thermalsFound: number;
  isProcessing: boolean;
}

export function ProcessingProgress({
  currentFlight,
  totalFlights,
  thermalsFound,
  isProcessing,
}: ProcessingProgressProps) {
  if (!isProcessing) return null;

  const pct = totalFlights > 0 ? (currentFlight / totalFlights) * 100 : 0;

  return (
    <div className="rounded-xl bg-gray-900/80 px-4 py-3 text-white shadow-lg backdrop-blur-md">
      <p className="mb-2 text-sm">
        Processing flight {currentFlight} of {totalFlights}...{" "}
        <span className="text-gray-400">({thermalsFound} thermals found)</span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
