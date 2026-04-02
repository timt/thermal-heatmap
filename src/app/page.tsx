"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ThermalData } from "@/components/MapView";
import { DatePicker } from "@/components/DatePicker";
import { ClimbRateSlider } from "@/components/ClimbRateSlider";
import { StatsPanel } from "@/components/StatsPanel";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { CacheFreshness } from "@/components/CacheFreshness";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const BATCH_SIZE = 5;

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

interface FlightInfo {
  id: string;
  hasTrackData: boolean;
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(yesterday);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [minClimbRate, setMinClimbRate] = useState(0.5);
  const [thermals, setThermals] = useState<ThermalData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFlight, setCurrentFlight] = useState(0);
  const [totalFlights, setTotalFlights] = useState(0);
  const [thermalsFound, setThermalsFound] = useState(0);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [flightCount, setFlightCount] = useState(0);
  const [newFlightsAvailable, setNewFlightsAvailable] = useState(0);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch processed dates for calendar
  useEffect(() => {
    fetch("/api/processed-dates?source=bga")
      .then((r) => r.json())
      .then((data) => {
        setProcessedDates(data.dates.map((d: { date: string }) => d.date));
        // Default to most recent processed date if available
        if (data.dates.length > 0) {
          setSelectedDate(data.dates[0].date);
        }
      })
      .catch(console.error);
  }, []);

  // Load data when date changes
  const loadDate = useCallback(async (date: string) => {
    // Cancel any in-progress processing
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setThermals([]);
    setIsProcessing(false);
    setProcessedAt(null);
    setNewFlightsAvailable(0);

    try {
      // Check for cached thermals
      const thermalsRes = await fetch(
        `/api/thermals?source=bga&date=${date}`,
        { signal },
      );
      const thermalsData = await thermalsRes.json();

      if (thermalsData.status === "ready") {
        setThermals(thermalsData.thermals);
        setFlightCount(thermalsData.metadata.flightCount);
        setProcessedAt(thermalsData.metadata.processedAt);

        // Background check for new flights
        checkForNewFlights(date, thermalsData.metadata.flightCount, signal);
        return;
      }

      // Need to fetch flights and process
      const flightsRes = await fetch(
        `/api/flights?source=bga&date=${date}`,
        { signal },
      );
      const flightsData = await flightsRes.json();

      if (!flightsData.flights || flightsData.flights.length === 0) {
        setFlightCount(0);
        return;
      }

      setFlightCount(flightsData.totalCount);

      // Start batch processing
      const flightsWithTrack: FlightInfo[] = flightsData.flights.filter(
        (f: FlightInfo) => f.hasTrackData,
      );
      await processBatches(date, flightsWithTrack, signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    }
  }, []);

  useEffect(() => {
    loadDate(selectedDate);
  }, [selectedDate, loadDate]);

  async function checkForNewFlights(
    date: string,
    cachedCount: number,
    signal: AbortSignal,
  ) {
    try {
      const res = await fetch(`/api/flights?source=bga&date=${date}`, {
        signal,
      });
      const data = await res.json();
      const diff = data.totalCount - cachedCount;
      if (diff > 0) setNewFlightsAvailable(diff);
    } catch {
      // ignore
    }
  }

  async function processBatches(
    date: string,
    flights: FlightInfo[],
    signal: AbortSignal,
  ) {
    setIsProcessing(true);
    setTotalFlights(flights.length);
    setCurrentFlight(0);
    setThermalsFound(0);

    const allThermals: ThermalData[] = [];

    for (let i = 0; i < flights.length; i += BATCH_SIZE) {
      if (signal.aborted) break;

      const batch = flights.slice(i, i + BATCH_SIZE);
      const rawIds = batch.map((f) => f.id.replace("bga:", ""));

      try {
        const res = await fetch("/api/thermals/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "bga",
            date,
            flightIds: rawIds,
          }),
          signal,
        });

        const data = await res.json();
        allThermals.push(...data.thermals);
        setThermals([...allThermals]);
        setCurrentFlight(Math.min(i + BATCH_SIZE, flights.length));
        setThermalsFound(data.runningTotals.totalThermals);
      } catch (e) {
        if ((e as Error).name === "AbortError") break;
        console.error("Batch processing error:", e);
      }
    }

    setIsProcessing(false);
    setProcessedAt(new Date().toISOString());
    // Refresh processed dates
    fetch("/api/processed-dates?source=bga")
      .then((r) => r.json())
      .then((data) =>
        setProcessedDates(data.dates.map((d: { date: string }) => d.date)),
      )
      .catch(console.error);
  }

  function handleRefresh() {
    setNewFlightsAvailable(0);
    // Force re-process by loading the date again
    loadDate(selectedDate);
  }

  // Compute stats from thermals
  const filteredThermals = thermals.filter(
    (t) => t.avgClimbRate >= minClimbRate,
  );
  const avgClimb =
    filteredThermals.length > 0
      ? filteredThermals.reduce((s, t) => s + t.avgClimbRate, 0) /
        filteredThermals.length
      : 0;
  const bestClimb =
    filteredThermals.length > 0
      ? Math.max(...filteredThermals.map((t) => t.avgClimbRate))
      : 0;
  const maxAltGain =
    filteredThermals.length > 0
      ? Math.max(...filteredThermals.map((t) => t.altGain))
      : 0;
  const highestTop =
    filteredThermals.length > 0
      ? Math.max(...filteredThermals.map((t) => t.topAlt))
      : 0;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <MapView thermals={thermals} minClimbRate={minClimbRate} />

      {/* Top-left: date picker + controls */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <DatePicker
          selectedDate={selectedDate}
          processedDates={processedDates}
          onDateChange={setSelectedDate}
        />
        <ClimbRateSlider value={minClimbRate} onChange={setMinClimbRate} />
      </div>

      {/* Bottom-left: stats */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-2">
        <StatsPanel
          flightsAnalysed={flightCount}
          thermalsDetected={filteredThermals.length}
          avgClimbRate={avgClimb}
          bestClimbRate={bestClimb}
          maxAltGain={Math.round(maxAltGain)}
          highestTop={Math.round(highestTop)}
          isCollapsed={statsCollapsed}
          onToggleCollapse={() => setStatsCollapsed((v) => !v)}
        />
        <CacheFreshness
          processedAt={processedAt}
          flightCount={flightCount}
          newFlightsAvailable={newFlightsAvailable}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Top-centre: processing progress */}
      <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
        <ProcessingProgress
          currentFlight={currentFlight}
          totalFlights={totalFlights}
          thermalsFound={thermalsFound}
          isProcessing={isProcessing}
        />
      </div>
    </main>
  );
}
