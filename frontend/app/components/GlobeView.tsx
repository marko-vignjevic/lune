"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSatellites, fetchSatellitePositions } from "../lib/api";

type Sat = {
  satelliteId: number;
  name: string;
  latitude: number;
  longitude: number;
  altitudeKm: number;
  type?: string;
};

type GlobeInstance = {
  width: (w: number) => GlobeInstance;
  height: (h: number) => GlobeInstance;
  backgroundColor: (c: string) => GlobeInstance;
  backgroundImageUrl: (url: string) => GlobeInstance;
  globeImageUrl: (url: string) => GlobeInstance;
  showAtmosphere: (v: boolean) => GlobeInstance;
  atmosphereAltitude: (v: number) => GlobeInstance;
  atmosphereColor: (c: string) => GlobeInstance;
  showGraticules: (v: boolean) => GlobeInstance;
  pointsData: (d: any[]) => GlobeInstance;
  pointLat: (a: any) => GlobeInstance;
  pointLng: (a: any) => GlobeInstance;
  pointAltitude: (a: any) => GlobeInstance;
  pointColor: (a: any) => GlobeInstance;
  pointRadius: (a: any) => GlobeInstance;
  pointLabel: (a: any) => GlobeInstance;
  pointOfView: (pov: { lat: number; lng: number; altitude: number }, ms?: number) => GlobeInstance;
};

const EARTH_RADIUS_KM = 6371;

function generateStarfieldDataUrl(
  width = 2048,
  height = 1024,
  stars = 2500
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#050510");
  g.addColorStop(1, "#000005");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // Stars
  for (let i = 0; i < stars; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() < 0.92 ? Math.random() * 1.2 : 1.2 + Math.random() * 1.8;
    const a = 0.3 + Math.random() * 0.7;
    const tint = Math.random();
    const color =
      tint < 0.6
        ? `rgba(255,255,255,${a})`
        : tint < 0.8
        ? `rgba(180,200,255,${a})`
        : `rgba(255,220,180,${a})`;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [satellites, setSatellites] = useState<Sat[]>([]);
  const [satType, setSatType] = useState<string>("Popular");
  const [satIds, setSatIds] = useState<{ id: number; name: string }[]>([]);

  const SAT_TYPES = [
    "Popular",
    "Stations",
    "Starlink",
    "OneWeb",
    "GPS",
    "GLONASS",
    "Galileo",
    "BeiDou",
    "Communications",
    "Geostationary",
    "Weather",
    "Earth Imaging",
    "Amateur",
  ];

  // Maps display label → backend params (type = CelesTrak group name, group = curated list)
  const SAT_TYPE_OPTS: Record<string, { type?: string; group?: string }> = {
    "Popular":       { group: "popular" },
    "Stations":      { type: "STATIONS" },
    "Starlink":      { type: "STARLINK" },
    "OneWeb":        { type: "ONEWEB" },
    "GPS":           { type: "GPS-OPS" },
    "GLONASS":       { type: "GLO-OPS" },
    "Galileo":       { type: "GALILEO" },
    "BeiDou":        { type: "BEIDOU" },
    "Communications":{ type: "INTELSAT" },
    "Geostationary": { type: "GEO" },
    "Weather":       { type: "NOAA" },
    "Earth Imaging": { type: "RESOURCE" },
    "Amateur":       { type: "AMATEUR" },
  };

  useEffect(() => {
    const init = async () => {
      if (!containerRef.current) return;

      const GlobeCtor = (await import("globe.gl")).default as unknown as new (
        el: HTMLElement
      ) => GlobeInstance;

      const starBg = generateStarfieldDataUrl();
      const globe = new GlobeCtor(containerRef.current)
        .backgroundColor("#000011")
        .backgroundImageUrl(starBg)
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
        .showAtmosphere(true)
        .atmosphereAltitude(0.12)
        .atmosphereColor("rgba(100, 150, 255, 0.4)")
        .showGraticules(true)
        .pointLat("latitude")
        .pointLng("longitude")
        .pointAltitude((d: any) => d.altitudeRatio)
        .pointColor((d: any) => d.color)
        .pointRadius(0.2)
        .pointLabel((d: any) => `${d.name} — ${Math.round(d.altitudeKm ?? 0)} km`)
        .pointsData([]);

      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 0);

      globeRef.current = globe;

      const resize = () => {
        const el = containerRef.current;
        if (!el || !globeRef.current) return;
        globeRef.current.width(el.clientWidth).height(el.clientHeight);
      };
      resize();
      window.addEventListener("resize", resize);

      return () => window.removeEventListener("resize", resize);
    };

    init();

    return () => {};
  }, []);

  // Fetch satellite list ONCE when the type changes
  useEffect(() => {
    let aborted = false;
    setSatellites([]);
    setSatIds([]);
    const opts = SAT_TYPE_OPTS[satType] ?? { search: satType };
    fetchSatellites(1, 30, opts)
      .then((resp) => {
        if (aborted) return;
        const ids = (resp.satellites ?? [])
          .filter((x: any) => typeof x?.satelliteId === "number")
          .map((x: any) => ({ id: x.satelliteId, name: x.name ?? String(x.satelliteId) }));
        setSatIds(ids);
      })
      .catch((e) => console.error("Failed to load satellite list", e));
    return () => { aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satType]);

  // Poll positions every second using the fetched IDs
  useEffect(() => {
    if (satIds.length === 0) return;
    let timer: number | null = null;
    let aborted = false;
    const ids = satIds.map((s) => s.id);
    const nameMap = Object.fromEntries(satIds.map((s) => [s.id, s.name]));

    const tick = async () => {
      try {
        const data = (await fetchSatellitePositions(ids)) as any[];
        if (aborted) return;
        const sats: Sat[] = (data ?? [])
          .filter((x) => typeof x?.satelliteId === "number")
          .map((x) => ({
            satelliteId: x.satelliteId,
            name: x.name ?? nameMap[x.satelliteId] ?? String(x.satelliteId),
            latitude: x.latitude,
            longitude: x.longitude,
            altitudeKm: x.altitudeKm,
          }));
        setSatellites(sats);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (e) {
        console.error("satellite position update failed", e);
      } finally {
        if (!aborted) timer = window.setTimeout(tick, 5000);
      }
    };

    tick();
    return () => {
      aborted = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [satIds]);

  useEffect(() => {
    if (!globeRef.current) return;
    const SATELLITE_COLORS = ["#ff9800", "#ffeb3b", "#8bc34a", "#ff5722", "#ffc107", "#4caf50", "#ffa726"];
    const points = satellites.map((s, i) => ({
      ...s,
      altitudeRatio: Math.max(0, Math.min(0.5, (s.altitudeKm ?? 0) / EARTH_RADIUS_KM)),
      color: SATELLITE_COLORS[i % SATELLITE_COLORS.length],
    }));
    globeRef.current.pointsData(points);
  }, [satellites]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "white",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.4,
          maxWidth: 360,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Lune Globe</div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="sat-type-select" style={{ marginRight: 8 }}>Type:</label>
          <select
            id="sat-type-select"
            value={satType}
            onChange={e => setSatType(e.target.value)}
            style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "#222", color: "#fff" }}
          >
            {SAT_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>Satellites: {satellites.length}</div>
        <div>Update: {lastUpdated ?? "--"}</div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.75)" }}>
          Tip: open DevTools → Network → Fetch/XHR to see the live polling.
        </div>
      </div>
    </div>
  );
}

