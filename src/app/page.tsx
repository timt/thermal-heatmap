"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ThermalData, MapPosition } from "@/components/MapView";
import { DatePicker } from "@/components/DatePicker";
import { ClimbRateSlider } from "@/components/ClimbRateSlider";
import { SourceSelector } from "@/components/SourceSelector";
import { StatsPanel } from "@/components/StatsPanel";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { CacheFreshness } from "@/components/CacheFreshness";
import { UnitToggle } from "@/components/UnitToggle";
import { ShareButton } from "@/components/ShareButton";
import { AltitudeProfile } from "@/components/AltitudeProfile";
import type { UnitSystem } from "@/lib/units";
import { isRecheckDue } from "@/lib/freshness";

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

function getUrlParams(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
}

function getStoredSource(): string {
  if (typeof window === "undefined") return "bga";
  const url = getUrlParams();
  return url?.get("source") ?? localStorage.getItem("thermal-source") ?? "bga";
}

function getStoredRegion(): string {
  if (typeof window === "undefined") return "GB";
  const url = getUrlParams();
  return url?.get("region") ?? localStorage.getItem("thermal-region") ?? "GB";
}

function getStoredUnits(): UnitSystem {
  if (typeof window === "undefined") return "uk";
  const url = getUrlParams();
  const fromUrl = url?.get("units");
  if (fromUrl === "metric" || fromUrl === "uk") return fromUrl;
  return (localStorage.getItem("thermal-units") as UnitSystem) ?? "uk";
}

function getInitialDate(): string {
  if (typeof window === "undefined") return yesterday();
  const url = getUrlParams();
  const dateParam = url?.get("date");
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam;
  return yesterday();
}

function getInitialMinClimb(): number {
  if (typeof window === "undefined") return 0.5;
  const url = getUrlParams();
  const param = url?.get("minClimb");
  if (param) {
    const parsed = parseFloat(param);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 0.5;
}

function getInitialMapPosition(): { center: [number, number]; zoom: number } | null {
  if (typeof window === "undefined") return null;
  const url = getUrlParams();
  const lat = url?.get("lat");
  const lng = url?.get("lng");
  const zoom = url?.get("zoom");
  if (lat && lng && zoom) {
    const parsed = { lat: parseFloat(lat), lng: parseFloat(lng), zoom: parseInt(zoom, 10) };
    if (!isNaN(parsed.lat) && !isNaN(parsed.lng) && !isNaN(parsed.zoom)) {
      return { center: [parsed.lat, parsed.lng], zoom: parsed.zoom };
    }
  }
  return null;
}

export default function Home() {
  const [source, setSource] = useState(getStoredSource);
  const [region, setRegion] = useState(getStoredRegion);
  const [units, setUnits] = useState<UnitSystem>(getStoredUnits);
  const [selectedDate, setSelectedDate] = useState(getInitialDate);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [activityDates, setActivityDates] = useState<string[]>([]);
  const [minClimbRate, setMinClimbRate] = useState(getInitialMinClimb);
  const [initialMapPos] = useState(getInitialMapPosition);
  const mapPositionRef = useRef<MapPosition | null>(null);
  const hasUrlDate = useRef(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("date"));
  const [thermals, setThermals] = useState<ThermalData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFlight, setCurrentFlight] = useState(0);
  const [totalFlights, setTotalFlights] = useState(0);
  const [thermalsFound, setThermalsFound] = useState(0);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [flightCount, setFlightCount] = useState(0);
  const [newFlightsAvailable, setNewFlightsAvailable] = useState(0);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [altProfileCollapsed, setAltProfileCollapsed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  function handleSourceChange(newSource: string) {
    setSource(newSource);
    localStorage.setItem("thermal-source", newSource);
  }

  function handleRegionChange(newRegion: string) {
    setRegion(newRegion);
    localStorage.setItem("thermal-region", newRegion);
  }

  function handleUnitsChange(newUnits: UnitSystem) {
    setUnits(newUnits);
    localStorage.setItem("thermal-units", newUnits);
  }

  const handleMapViewChange = useCallback((position: MapPosition) => {
    mapPositionRef.current = position;
  }, []);

  const buildShareUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("source", source);
    params.set("date", selectedDate);
    params.set("region", region);
    params.set("minClimb", String(minClimbRate));
    params.set("units", units);
    const pos = mapPositionRef.current;
    if (pos) {
      params.set("lat", String(pos.lat));
      params.set("lng", String(pos.lng));
      params.set("zoom", String(pos.zoom));
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [source, selectedDate, region, minClimbRate, units]);

  // Sync shareable state to URL (debounced)
  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    urlTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("source", source);
      params.set("date", selectedDate);
      params.set("region", region);
      params.set("minClimb", String(minClimbRate));
      params.set("units", units);
      const pos = mapPositionRef.current;
      if (pos) {
        params.set("lat", String(pos.lat));
        params.set("lng", String(pos.lng));
        params.set("zoom", String(pos.zoom));
      }
      window.history.replaceState(null, "", `?${params.toString()}`);
    }, 500);
    return () => { if (urlTimerRef.current) clearTimeout(urlTimerRef.current); };
  }, [source, selectedDate, region, minClimbRate, units]);

  // Fetch processed dates and activity calendar when source changes
  useEffect(() => {
    fetch(`/api/processed-dates?source=${source}`)
      .then((r) => r.json())
      .then((data) => {
        const dates = data.dates.map((d: { date: string }) => d.date);
        setProcessedDates(dates);
        if (dates.length > 0 && !hasUrlDate.current) {
          setSelectedDate(dates[0]);
        }
        hasUrlDate.current = false;
      })
      .catch(console.error);

    // Fetch activity calendar for WeGlide
    if (source === "weglide") {
      const season = String(new Date().getFullYear());
      fetch(`/api/activity-calendar?source=weglide&season=${season}`)
        .then((r) => r.json())
        .then((data) => {
          setActivityDates(
            data.dates.map((d: { date: string }) => d.date),
          );
        })
        .catch(console.error);
    } else {
      setActivityDates([]);
    }
  }, [source]);

  // Load data when date or source changes
  const loadDate = useCallback(async (date: string, currentSource: string, currentRegion: string) => {
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
        `/api/thermals?source=${currentSource}&date=${date}`,
        { signal },
      );
      const thermalsData = await thermalsRes.json();

      if (thermalsData.status === "ready") {
        setThermals(thermalsData.thermals);
        setFlightCount(thermalsData.metadata.flightCount);
        setProcessedAt(thermalsData.metadata.processedAt);

        // Background check for new flights (respects age-based backoff)
        const { lastCheckedAt } = thermalsData.metadata;
        if (isRecheckDue(date, lastCheckedAt)) {
          checkAndRefresh(date, currentSource, currentRegion, signal);
        }
        return;
      }

      // Need to fetch flights and process
      const regionParam = currentSource === "weglide" && currentRegion ? `&region=${currentRegion}` : "";
      const flightsRes = await fetch(
        `/api/flights?source=${currentSource}&date=${date}${regionParam}`,
        { signal },
      );
      const flightsData = await flightsRes.json();

      if (!flightsData.flights || flightsData.flights.length === 0) {
        setFlightCount(0);
        return;
      }

      setFlightCount(flightsData.totalCount);

      // Start batch processing for flights with track data
      const flightsWithTrack: FlightInfo[] = flightsData.flights.filter(
        (f: FlightInfo) => f.hasTrackData,
      );

      if (flightsWithTrack.length === 0) {
        // No track data available (e.g. WeGlide) — nothing to process
        return;
      }

      await processBatches(date, currentSource, flightsWithTrack, signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    }
  }, []);

  useEffect(() => {
    loadDate(selectedDate, source, region);
  }, [selectedDate, source, region, loadDate]);

  async function checkAndRefresh(
    date: string,
    currentSource: string,
    currentRegion: string,
    signal: AbortSignal,
  ) {
    try {
      const res = await fetch(
        `/api/thermals/check?source=${currentSource}&date=${date}`,
        { signal },
      );
      const data = await res.json();
      if (data.newFlights > 0) {
        // Automatically re-fetch and re-process in the background
        loadDate(date, currentSource, currentRegion);
      }
    } catch {
      // ignore — background check failure is not critical
    }
  }

  async function processBatches(
    date: string,
    currentSource: string,
    flights: FlightInfo[],
    signal: AbortSignal,
  ) {
    setIsProcessing(true);
    setTotalFlights(flights.length);
    setCurrentFlight(0);
    setThermalsFound(0);

    const allThermals: ThermalData[] = [];
    const sourcePrefix = new RegExp(`^${currentSource}:`);

    for (let i = 0; i < flights.length; i += BATCH_SIZE) {
      if (signal.aborted) break;

      const batch = flights.slice(i, i + BATCH_SIZE);
      const rawIds = batch.map((f) => f.id.replace(sourcePrefix, ""));

      try {
        const res = await fetch("/api/thermals/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: currentSource,
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
    fetch(`/api/processed-dates?source=${currentSource}`)
      .then((r) => r.json())
      .then((data) =>
        setProcessedDates(data.dates.map((d: { date: string }) => d.date)),
      )
      .catch(console.error);
  }

  function handleRefresh() {
    setNewFlightsAvailable(0);
    loadDate(selectedDate, source, region);
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
      <MapView
        thermals={thermals}
        minClimbRate={minClimbRate}
        units={units}
        initialCenter={initialMapPos?.center}
        initialZoom={initialMapPos?.zoom}
        onViewChange={handleMapViewChange}
      />

      {/* Top-left: source selector, date picker + controls */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <SourceSelector
          source={source}
          onChange={handleSourceChange}
          region={region}
          onRegionChange={handleRegionChange}
        />
        <DatePicker
          selectedDate={selectedDate}
          processedDates={processedDates}
          activityDates={activityDates}
          onDateChange={setSelectedDate}
        />
        <ClimbRateSlider value={minClimbRate} onChange={setMinClimbRate} units={units} />
        <UnitToggle units={units} onChange={handleUnitsChange} />
        <ShareButton buildUrl={buildShareUrl} />
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
          units={units}
        />
        <AltitudeProfile
          thermals={filteredThermals}
          isCollapsed={altProfileCollapsed}
          onToggleCollapse={() => setAltProfileCollapsed((v) => !v)}
          units={units}
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
