"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, useMap } from "react-leaflet";
import L from "leaflet";

interface Position {
  lat: number;
  lon: number;
}

const RECENTER_ZOOM = 10;

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const deg = toDeg(Math.atan2(y, x));
  return (deg + 360) % 360;
}

function buildGliderIcon(headingDeg: number): L.DivIcon {
  // Top-down glider silhouette pointing north (up). Long thin wings, small fuselage.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"
         style="transform: rotate(${headingDeg}deg); transform-origin: center;
                filter: drop-shadow(0 0 2px rgba(0,0,0,0.7));">
      <g fill="#fbbf24" stroke="#000" stroke-width="0.6" stroke-linejoin="round">
        <!-- wings -->
        <path d="M2 21 L20 19 L38 21 L38 22 L20 21 L2 22 Z" />
        <!-- fuselage -->
        <path d="M19 6 L21 6 L21.6 28 L20 30 L18.4 28 Z" />
        <!-- tail -->
        <path d="M16.5 30 L23.5 30 L22.5 32 L17.5 32 Z" />
      </g>
    </svg>
  `;
  return L.divIcon({
    className: "user-glider-icon",
    html: svg,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function UserLocationLayer() {
  const map = useMap();
  const [position, setPosition] = useState<Position | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const previousRef = useRef<Position | null>(null);
  const hasAutoCentredRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Position = { lat: pos.coords.latitude, lon: pos.coords.longitude };

        // Heading: prefer GPS-derived, otherwise compute from previous fix
        const gpsHeading = pos.coords.heading;
        let nextHeading: number | null = null;
        if (gpsHeading !== null && !isNaN(gpsHeading)) {
          nextHeading = gpsHeading;
        } else if (previousRef.current) {
          const dLat = next.lat - previousRef.current.lat;
          const dLon = next.lon - previousRef.current.lon;
          // Only update heading if the device has actually moved meaningfully
          if (Math.abs(dLat) + Math.abs(dLon) > 1e-5) {
            nextHeading = bearing(
              previousRef.current.lat,
              previousRef.current.lon,
              next.lat,
              next.lon,
            );
          }
        }

        if (nextHeading !== null) setHeading(nextHeading);
        previousRef.current = next;
        setPosition(next);

        if (!hasAutoCentredRef.current) {
          map.setView([next.lat, next.lon], RECENTER_ZOOM);
          hasAutoCentredRef.current = true;
        }
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [map]);

  function handleRecenter() {
    if (position) {
      map.setView([position.lat, position.lon], RECENTER_ZOOM);
    }
  }

  if (!position) return null;

  return (
    <>
      <Marker position={[position.lat, position.lon]} icon={buildGliderIcon(heading)} />
      <RecenterButton onClick={handleRecenter} />
    </>
  );
}

function RecenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Recenter on my location"
      className="safe-bottom absolute bottom-24 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-gray-900/80 text-white shadow-lg backdrop-blur-md hover:bg-gray-900 md:bottom-4"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <line x1="12" y1="1" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="23" />
        <line x1="1" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="23" y2="12" />
      </svg>
    </button>
  );
}
