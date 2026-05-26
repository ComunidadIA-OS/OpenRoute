"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import polyline from "@mapbox/polyline";

export type MapStop = {
  id: string;
  sequence: number;
  lat: number;
  lng: number;
  status: string;
  customer: string;
  address: string;
  eta?: string;
};

type Props = {
  polyline?: string | null;
  depot: { lat: number; lng: number };
  stops: MapStop[];
  selectedStopId?: string | null;
  onSelectStop?: (id: string) => void;
};

const DEFAULT_CENTER: [number, number] = [38.3460, -0.4907];

function numberedIcon(seq: number, status: string, selected: boolean) {
  const classes = ["numbered-marker"];
  if (selected) classes.push("selected");
  if (status === "DELIVERED") classes.push("delivered");
  if (status === "FAILED" || status === "SKIPPED") classes.push("failed");
  return L.divIcon({
    className: classes.join(" "),
    html: `<div class="marker-pin"><span>${seq}</span></div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });
}

function depotIcon() {
  return L.divIcon({
    className: "numbered-marker depot",
    html: `<div class="marker-pin"><span>🏭</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, positions]);
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { duration: 0.6 });
    }
  }, [map, target]);
  return null;
}

export default function RouteMap({ polyline: polyStr, depot, stops, selectedStopId, onSelectStop }: Props) {
  const decoded = useMemo<[number, number][]>(() => {
    if (!polyStr) return [];
    try {
      return polyline.decode(polyStr, 6) as [number, number][];
    } catch {
      return [];
    }
  }, [polyStr]);

  const allPositions: [number, number][] = useMemo(() => {
    const stopCoords: [number, number][] = stops.map((s) => [s.lat, s.lng]);
    const depotCoords: [number, number] = [depot.lat, depot.lng];
    return decoded.length > 0 ? decoded : [depotCoords, ...stopCoords];
  }, [decoded, stops, depot]);

  const flyTarget = useMemo<[number, number] | null>(() => {
    if (!selectedStopId) return null;
    const s = stops.find((x) => x.id === selectedStopId);
    return s ? [s.lat, s.lng] : null;
  }, [selectedStopId, stops]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {decoded.length > 0 && (
        <Polyline positions={decoded} pathOptions={{ color: "#1a531a", weight: 5, opacity: 0.85 }} />
      )}

      <Marker position={[depot.lat, depot.lng]} icon={depotIcon()} />

      {stops.map((stop) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lng]}
          icon={numberedIcon(stop.sequence, stop.status, stop.id === selectedStopId)}
          eventHandlers={{
            click: () => onSelectStop?.(stop.id),
          }}
        />
      ))}

      <FitBounds positions={allPositions} />
      <FlyTo target={flyTarget} />
    </MapContainer>
  );
}
