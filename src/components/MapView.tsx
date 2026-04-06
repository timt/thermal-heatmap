"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import type { UnitSystem } from "@/lib/units";
import { formatClimbRate, formatAltitude } from "@/lib/units";

export interface ThermalData {
  lat: number;
  lon: number;
  avgClimbRate: number;
  altGain: number;
  baseAlt: number;
  topAlt: number;
  entryTime: string;
  exitTime: string;
  flightId?: number;
  aircraft?: string;
  registration?: string | null;
}

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

export interface MapViewProps {
  thermals: ThermalData[];
  minClimbRate: number;
  units: UnitSystem;
  initialCenter?: [number, number];
  initialZoom?: number;
  onViewChange?: (position: MapPosition) => void;
}

function getMarkerColour(climbRate: number): string {
  if (climbRate < 1) return "#3b82f6"; // blue
  if (climbRate < 2) return "#22c55e"; // green
  if (climbRate < 3) return "#eab308"; // yellow
  if (climbRate < 4) return "#f97316"; // orange
  return "#ef4444"; // red
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function HeatmapLayer({
  thermals,
  minClimbRate,
}: {
  thermals: ThermalData[];
  minClimbRate: number;
}) {
  const map = useMap();
  const heatLayerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const filtered = thermals.filter((t) => t.avgClimbRate >= minClimbRate);
    if (filtered.length === 0) return;

    const maxClimbRate = Math.max(...filtered.map((t) => t.avgClimbRate));

    const points: [number, number, number][] = filtered.map((t) => [
      t.lat,
      t.lon,
      maxClimbRate > 0 ? t.avgClimbRate / maxClimbRate : 0,
    ]);

    const layer = (L as any).heatLayer(points, {
      radius: 25,
      blur: 20,
      maxZoom: 12,
      gradient: {
        0.0: "#3b82f6",
        0.25: "#22c55e",
        0.5: "#eab308",
        0.75: "#f97316",
        1.0: "#ef4444",
      },
    });

    layer.addTo(map);
    heatLayerRef.current = layer;

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, thermals, minClimbRate]);

  return null;
}

function MapStateTracker({ onViewChange }: { onViewChange: (position: MapPosition) => void }) {
  const map = useMap();

  useEffect(() => {
    function handleMoveEnd() {
      const center = map.getCenter();
      onViewChange({
        lat: parseFloat(center.lat.toFixed(4)),
        lng: parseFloat(center.lng.toFixed(4)),
        zoom: map.getZoom(),
      });
    }

    map.on("moveend", handleMoveEnd);
    return () => { map.off("moveend", handleMoveEnd); };
  }, [map, onViewChange]);

  return null;
}

export default function MapView({ thermals, minClimbRate, units, initialCenter, initialZoom, onViewChange }: MapViewProps) {
  const filtered = thermals.filter((t) => t.avgClimbRate >= minClimbRate);

  return (
    <MapContainer
      center={initialCenter ?? [52.5, -1.5]}
      zoom={initialZoom ?? 6}
      style={{ height: "100%", width: "100%" }}
    >
      {onViewChange && <MapStateTracker onViewChange={onViewChange} />}
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Dark">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Light">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay name="Labels">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.Overlay>
      </LayersControl>

      <HeatmapLayer thermals={thermals} minClimbRate={minClimbRate} />

      {filtered.map((thermal, index) => (
        <CircleMarker
          key={`${thermal.lat}-${thermal.lon}-${index}`}
          center={[thermal.lat, thermal.lon]}
          radius={6}
          pathOptions={{
            color: getMarkerColour(thermal.avgClimbRate),
            fillColor: getMarkerColour(thermal.avgClimbRate),
            fillOpacity: 0.8,
            weight: 1,
          }}
        >
          <Popup>
            <div>
              <strong>{formatClimbRate(thermal.avgClimbRate, units)}</strong>
              <br />
              Altitude gain: {formatAltitude(thermal.altGain, units)}
              <br />
              Base: {formatAltitude(thermal.baseAlt, units)}
              <br />
              Top: {formatAltitude(thermal.topAlt, units)}
              <br />
              Time: {formatTime(thermal.entryTime)}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
