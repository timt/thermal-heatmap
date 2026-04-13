import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { lazy, Suspense } from "react";
import type { ThermalData, MapPosition } from "@/components/MapView";
import type { TrackerStatus } from "@/lib/types";
import { DatePicker } from "@/components/DatePicker";
import { ClimbRateSlider } from "@/components/ClimbRateSlider";
import { SourceSelector } from "@/components/SourceSelector";
import { StatsPanel } from "@/components/StatsPanel";
import { UnitToggle } from "@/components/UnitToggle";
import { AltitudeProfile } from "@/components/AltitudeProfile";
import { AircraftFilter } from "@/components/AircraftFilter";
import { IconBar } from "@/components/IconBar";
import { MobileIconBar } from "@/components/MobileIconBar";
import type { PanelId } from "@/components/IconBar";
import type { UnitSystem } from "@/lib/units";
import { apiUrl } from "@/lib/api";

const MapView = lazy(() => import("@/components/MapView"));

const PROCESSING_POLL_MS = 10_000;

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function getStoredSource(): string {
  const url = getUrlParams();
  return url.get("source") ?? localStorage.getItem("thermal-source") ?? "bga";
}

function getStoredRegion(): string {
  const url = getUrlParams();
  return url.get("region") ?? localStorage.getItem("thermal-region") ?? "GB";
}

function getStoredUnits(): UnitSystem {
  const url = getUrlParams();
  const fromUrl = url.get("units");
  if (fromUrl === "metric" || fromUrl === "uk") return fromUrl;
  return (localStorage.getItem("thermal-units") as UnitSystem) ?? "uk";
}

function getInitialDate(): string {
  const url = getUrlParams();
  const dateParam = url.get("date");
  if (dateParam === "live") return "live";
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam;
  return yesterday();
}

function getInitialMinClimb(): number {
  const url = getUrlParams();
  const param = url.get("minClimb");
  if (param) {
    const parsed = parseFloat(param);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 0.5;
}

function getInitialMapPosition(): { center: [number, number]; zoom: number } | null {
  const url = getUrlParams();
  const lat = url.get("lat");
  const lng = url.get("lng");
  const zoom = url.get("zoom");
  if (lat && lng && zoom) {
    const parsed = { lat: parseFloat(lat), lng: parseFloat(lng), zoom: parseInt(zoom, 10) };
    if (!isNaN(parsed.lat) && !isNaN(parsed.lng) && !isNaN(parsed.zoom)) {
      return { center: [parsed.lat, parsed.lng], zoom: parsed.zoom };
    }
  }
  return null;
}

export default function ThermalMap() {
  const [source, setSource] = useState(getStoredSource);
  const [region, setRegion] = useState(getStoredRegion);
  const [units, setUnits] = useState<UnitSystem>(getStoredUnits);
  const [selectedDate, setSelectedDate] = useState(getInitialDate);
  const [processedDates, setProcessedDates] = useState<string[]>([]);
  const [activityDates, setActivityDates] = useState<string[]>([]);
  const [minClimbRate, setMinClimbRate] = useState(getInitialMinClimb);
  const [initialMapPos] = useState(getInitialMapPosition);
  const mapPositionRef = useRef<MapPosition | null>(null);
  const hasUrlDate = useRef(new URLSearchParams(window.location.search).has("date"));
  const [thermals, setThermals] = useState<ThermalData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [flightCount, setFlightCount] = useState(0);
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | undefined>(undefined);

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
    fetch(apiUrl(`/processed-dates?source=${source}`))
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

    if (source === "weglide") {
      const season = String(new Date().getFullYear());
      fetch(apiUrl(`/activity-calendar?source=weglide&season=${season}`))
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

  // Load thermals when date or source changes. The worker processes
  // everything in the background — we just fetch and display. If the
  // worker is still processing, poll until it's ready.
  const loadDate = useCallback(async (date: string, currentSource: string) => {
    setThermals([]);
    setIsProcessing(false);
    setProcessedAt(null);
    setSelectedAircraft(null);
    setSelectedRegistration(null);

    try {
      const res = await fetch(
        apiUrl(`/thermals?source=${currentSource}&date=${date}`),
      );
      const data = await res.json();

      if (data.status === "ready") {
        setThermals(data.thermals);
        setFlightCount(data.metadata.flightCount);
        setProcessedAt(data.metadata.processedAt);
        return;
      }

      // Worker is still processing — show indicator and poll.
      setIsProcessing(true);
      setFlightCount(data.flightCount ?? 0);
    } catch (e) {
      console.error("Failed to load thermals:", e);
    }
  }, []);

  const isLiveMode = selectedDate === "live";

  useEffect(() => {
    if (isLiveMode) return;
    loadDate(selectedDate, source);
  }, [selectedDate, source, region, loadDate, isLiveMode]);

  // Poll while the worker is still processing this date.
  useEffect(() => {
    if (!isProcessing || isLiveMode) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          apiUrl(`/thermals?source=${source}&date=${selectedDate}`),
        );
        const data = await res.json();

        if (data.status === "ready") {
          setThermals(data.thermals);
          setFlightCount(data.metadata.flightCount);
          setProcessedAt(data.metadata.processedAt);
          setIsProcessing(false);
        }
      } catch {
        // ignore — we'll retry on the next tick
      }
    }, PROCESSING_POLL_MS);

    return () => clearInterval(timer);
  }, [isProcessing, isLiveMode, source, selectedDate]);

  // Live mode: poll /live/thermals every 30s
  useEffect(() => {
    if (!isLiveMode) return;

    setIsProcessing(false);
    setProcessedAt("LIVE");
    setSelectedAircraft(null);
    setSelectedRegistration(null);

    let cancelled = false;

    async function fetchLive() {
      try {
        const res = await fetch(apiUrl("/live/thermals?max_age=3600"));
        if (!res.ok) {
          setTrackerStatus("error");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setTrackerStatus(data.trackerStatus ?? "ok");
        const now = Date.now();
        const mapped: ThermalData[] = data.thermals.map((t: {
          lat: number;
          lon: number;
          avgClimbRate: number;
          altGain: number;
          baseAlt: number;
          topAlt: number;
          entryTime: string;
          exitTime: string;
        }) => ({
          lat: t.lat,
          lon: t.lon,
          avgClimbRate: t.avgClimbRate,
          altGain: t.altGain,
          baseAlt: t.baseAlt,
          topAlt: t.topAlt,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          ageSeconds: Math.max(0, Math.floor((now - new Date(t.exitTime).getTime()) / 1000)),
        }));
        setThermals(mapped);
        setFlightCount(mapped.length);
      } catch (e) {
        console.error("Live thermals fetch failed:", e);
      }
    }

    fetchLive();
    const interval = setInterval(fetchLive, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setTrackerStatus(undefined);
    };
  }, [isLiveMode]);

  // Apply aircraft filter then climb rate filter
  const displayThermals = useMemo(() => {
    let filtered = thermals;
    if (selectedAircraft) {
      filtered = filtered.filter((t) => t.aircraft === selectedAircraft);
    }
    if (selectedRegistration) {
      filtered = filtered.filter((t) => t.registration === selectedRegistration);
    }
    return filtered;
  }, [thermals, selectedAircraft, selectedRegistration]);

  const filteredThermals = displayThermals.filter(
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
    <main className="relative h-dvh w-screen overflow-hidden">
      <Suspense fallback={null}>
        <MapView
          thermals={displayThermals}
          minClimbRate={minClimbRate}
          units={units}
          initialCenter={initialMapPos?.center}
          initialZoom={initialMapPos?.zoom}
          onViewChange={handleMapViewChange}
          liveMode={isLiveMode}
        />
      </Suspense>

      {/* Desktop: icon bar + collapsible panels */}
      <div className="absolute left-0 top-0 z-[1000] hidden md:flex">
        <IconBar
          activePanel={activePanel}
          onPanelChange={(id) => setActivePanel(activePanel === id ? null : id)}
          onShare={() => {
            const url = buildShareUrl();
            navigator.clipboard.writeText(url).then(() => {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 2000);
            });
          }}
          shareLabel={shareCopied ? "Copied!" : "Share"}
          panels={{
            calendar: (
              <DatePicker
                selectedDate={selectedDate}
                processedDates={processedDates}
                activityDates={activityDates}
                onDateChange={setSelectedDate}
                trackerStatus={trackerStatus}
              />
            ),
            stats: (
              <StatsPanel
                flightsAnalysed={flightCount}
                thermalsDetected={filteredThermals.length}
                avgClimbRate={avgClimb}
                bestClimbRate={bestClimb}
                maxAltGain={Math.round(maxAltGain)}
                highestTop={Math.round(highestTop)}
                isCollapsed={false}
                onToggleCollapse={() => {}}
                units={units}
              />
            ),
            altitude: (
              <AltitudeProfile
                thermals={filteredThermals}
                isCollapsed={false}
                onToggleCollapse={() => {}}
                units={units}
              />
            ),
            filter: (
              <AircraftFilter
                thermals={thermals}
                selectedAircraft={selectedAircraft}
                selectedRegistration={selectedRegistration}
                onAircraftChange={setSelectedAircraft}
                onRegistrationChange={setSelectedRegistration}
              />
            ),
            settings: (
              <div className="flex flex-col gap-2">
                <SourceSelector
                  source={source}
                  onChange={handleSourceChange}
                  region={region}
                  onRegionChange={handleRegionChange}
                />
                <ClimbRateSlider value={minClimbRate} onChange={setMinClimbRate} units={units} />
                <UnitToggle units={units} onChange={handleUnitsChange} />
              </div>
            ),
          }}
        />
      </div>

      {/* Processing indicator: top-centre */}
      {isProcessing && (
        <div className="safe-top absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
          <div className="rounded-lg bg-zinc-900/90 px-4 py-2 text-sm text-zinc-300 shadow-lg backdrop-blur-sm">
            Processing {flightCount} flights...
          </div>
        </div>
      )}

      {/* Mobile: bottom icon bar + slide-up panels */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] md:hidden">
        <MobileIconBar
          activePanel={activePanel}
          onPanelChange={(id) => setActivePanel(activePanel === id ? null : id)}
          onShare={() => {
            const url = buildShareUrl();
            navigator.clipboard.writeText(url).then(() => {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 2000);
            });
          }}
          shareLabel={shareCopied ? "Copied!" : "Share"}
          panels={{
            calendar: (
              <DatePicker
                selectedDate={selectedDate}
                processedDates={processedDates}
                activityDates={activityDates}
                onDateChange={(date) => {
                  setSelectedDate(date);
                  setActivePanel(null);
                }}
                trackerStatus={trackerStatus}
              />
            ),
            stats: (
              <StatsPanel
                flightsAnalysed={flightCount}
                thermalsDetected={filteredThermals.length}
                avgClimbRate={avgClimb}
                bestClimbRate={bestClimb}
                maxAltGain={Math.round(maxAltGain)}
                highestTop={Math.round(highestTop)}
                isCollapsed={false}
                onToggleCollapse={() => {}}
                units={units}
              />
            ),
            altitude: (
              <AltitudeProfile
                thermals={filteredThermals}
                isCollapsed={false}
                onToggleCollapse={() => {}}
                units={units}
              />
            ),
            filter: (
              <AircraftFilter
                thermals={thermals}
                selectedAircraft={selectedAircraft}
                selectedRegistration={selectedRegistration}
                onAircraftChange={setSelectedAircraft}
                onRegistrationChange={setSelectedRegistration}
              />
            ),
            settings: (
              <div className="flex flex-col gap-3">
                <SourceSelector
                  source={source}
                  onChange={handleSourceChange}
                  region={region}
                  onRegionChange={handleRegionChange}
                />
                <ClimbRateSlider value={minClimbRate} onChange={setMinClimbRate} units={units} />
                <UnitToggle units={units} onChange={handleUnitsChange} />
              </div>
            ),
          }}
        />
      </div>
    </main>
  );
}
