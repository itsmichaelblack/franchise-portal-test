// src/FindACentre.jsx
// Public-facing "Find a Centre" page with interactive Google Map.
// Pulls locations from Firestore, geolocates the user, and shows nearest centres.

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

// ─── Geocode an address string into { lat, lng } using Google Maps Geocoder ──
function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps) return reject("Google Maps not loaded");
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject("Could not geocode address");
      }
    });
  });
}

// ─── Haversine distance (km) ─────────────────────────────────────────────────
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Icon helper ─────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ic = {
  mapPin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  navigation: "M3 11l19-9-9 19-2-8-8-2z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35",
  crosshair: "M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83",
  x: "M18 6L6 18 M6 6l12 12",
  directions: "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  back: "M15 18l-6-6 6-6",
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; }

  .fac {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    display: flex;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
    background: #f7f8fa;
  }

  /* ── Sidebar Panel ────────────────────────────────────────── */
  .fac-panel {
    width: 420px;
    min-width: 420px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-right: 1px solid #e8eaed;
    z-index: 10;
    box-shadow: 2px 0 16px rgba(0,0,0,0.06);
  }

  .fac-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e8eaed;
    background: linear-gradient(135deg, #fff9f5 0%, #f0fafa 100%);
  }
  .fac-header-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }
  .fac-logo {
    width: 40px;
    height: 40px;
    object-fit: contain;
  }
  .fac-brand {
    font-size: 18px;
    font-weight: 800;
    color: #1a1d23;
  }
  .fac-brand span { color: #E25D25; }
  .fac-tagline {
    font-size: 13px;
    color: #6b7280;
    margin-top: 2px;
  }

  /* ── Search Area ────────────────────────────────────────────── */
  .fac-search {
    padding: 16px 24px;
    border-bottom: 1px solid #e8eaed;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .fac-search-row {
    display: flex;
    gap: 8px;
  }
  .fac-search-input-wrap {
    flex: 1;
    position: relative;
  }
  .fac-search-input-wrap svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    pointer-events: none;
  }
  .fac-search-input {
    width: 100%;
    padding: 11px 12px 11px 38px;
    border-radius: 10px;
    border: 1.5px solid #e8eaed;
    font-family: inherit;
    font-size: 14px;
    color: #1a1d23;
    background: #f7f8fa;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .fac-search-input:focus {
    border-color: #E25D25;
    box-shadow: 0 0 0 3px rgba(226,93,37,0.1);
    background: #fff;
  }
  .fac-search-input::placeholder { color: #9ca3af; }
  .fac-locate-btn {
    padding: 0 14px;
    border-radius: 10px;
    border: 1.5px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    color: #E25D25;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .fac-locate-btn:hover {
    background: #fdf0ea;
    border-color: #E25D25;
  }
  .fac-locate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .fac-status {
    font-size: 12px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .fac-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fac-status-dot.green { background: #059669; }
  .fac-status-dot.orange { background: #E25D25; }
  .fac-status-dot.gray { background: #9ca3af; }

  /* ── Location List ──────────────────────────────────────────── */
  .fac-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  .fac-list-header {
    padding: 12px 24px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .fac-loc {
    padding: 16px 24px;
    cursor: pointer;
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.15s;
    display: flex;
    gap: 14px;
  }
  .fac-loc:hover { background: #fdf0ea; }
  .fac-loc.active { background: #fdf0ea; border-left: 3px solid #E25D25; }
  .fac-loc-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: #fdf0ea;
    color: #E25D25;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .fac-loc-info { flex: 1; min-width: 0; }
  .fac-loc-name {
    font-size: 15px;
    font-weight: 700;
    color: #1a1d23;
    margin-bottom: 4px;
  }
  .fac-loc-address {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .fac-loc-meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .fac-loc-meta-item {
    font-size: 12px;
    color: #9ca3af;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .fac-loc-distance {
    font-size: 13px;
    font-weight: 700;
    color: #E25D25;
    white-space: nowrap;
    flex-shrink: 0;
    align-self: flex-start;
    margin-top: 4px;
  }
  .fac-loc-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .fac-loc-action-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #E25D25;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
  }
  .fac-loc-action-btn:hover {
    background: #fdf0ea;
    border-color: #E25D25;
  }

  .fac-empty {
    padding: 48px 24px;
    text-align: center;
    color: #9ca3af;
  }
  .fac-empty-icon { font-size: 36px; margin-bottom: 12px; }
  .fac-empty-text { font-size: 14px; }
  .fac-loading {
    padding: 48px 24px;
    text-align: center;
    color: #9ca3af;
    font-size: 14px;
  }

  /* ── Map ────────────────────────────────────────────────────── */
  .fac-map {
    flex: 1;
    height: 100%;
    position: relative;
  }
  .fac-map-el {
    width: 100%;
    height: 100%;
  }

  /* ── Back link ──────────────────────────────────────────────── */
  .fac-back {
    padding: 12px 24px;
    border-top: 1px solid #e8eaed;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #9ca3af;
    cursor: pointer;
    background: none;
    border-left: none;
    border-right: none;
    border-bottom: none;
    font-family: inherit;
    transition: color 0.15s;
    width: 100%;
    text-align: left;
  }
  .fac-back:hover { color: #E25D25; }

  /* ── Mobile ────────────────────────────────────────────────── */
  .fac-mobile-toggle {
    display: none;
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    padding: 12px 24px;
    border-radius: 40px;
    border: none;
    background: #E25D25;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(226,93,37,0.4);
    gap: 8px;
    align-items: center;
  }

  @media (max-width: 768px) {
    .fac { flex-direction: column; }
    .fac-panel {
      width: 100%;
      min-width: 100%;
      height: 100%;
      position: fixed;
      top: 0; left: 0;
      z-index: 20;
      transition: transform 0.3s ease;
    }
    .fac-panel.hidden {
      transform: translateY(100%);
    }
    .fac-map { height: 100vh; height: 100dvh; }
    .fac-mobile-toggle {
      display: flex;
    }
  }

  /* ── Google autocomplete dropdown styling ────────────────── */
  .pac-container {
    border-radius: 10px !important;
    border: 1px solid #e8eaed !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
    margin-top: 4px !important;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important;
  }
  .pac-item {
    padding: 10px 14px !important;
    font-size: 13px !important;
    cursor: pointer !important;
  }
  .pac-item:hover {
    background: #fdf0ea !important;
  }
  .pac-item-query {
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  /* ── InfoWindow styling ──────────────────────────────────── */
  .gm-style-iw button.gm-ui-hover-effect {
    top: 4px !important;
    right: 4px !important;
    width: 28px !important;
    height: 28px !important;
    border-radius: 50% !important;
    background: #f3f4f6 !important;
    opacity: 1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .gm-style-iw button.gm-ui-hover-effect > span {
    margin: 0 !important;
    background-color: #6b7280 !important;
    width: 16px !important;
    height: 16px !important;
  }
  .gm-style-iw button.gm-ui-hover-effect:hover {
    background: #e5e7eb !important;
  }
  .gm-style .gm-style-iw-c {
    border-radius: 14px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
    padding: 4px !important;
  }
  .gm-style .gm-style-iw-d {
    overflow: auto !important;
  }
  .gm-style .gm-style-iw-tc::after {
    background: #fff !important;
  }
`;

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FindACentre() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState(null);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [locStatus, setLocStatus] = useState("idle"); // idle | locating | located | denied | error
  const [showPanel, setShowPanel] = useState(true);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const clustererRef = useRef(null);
  const userMarkerRef = useRef(null);
  const searchInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const infoWindowRef = useRef(null);

  // ── Load locations from Firestore ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "locations"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const locs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLocations(locs);
      } catch (e) {
        console.error("Failed to load locations:", e);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ── Geocode locations that don't have lat/lng yet ──────────────────────
  useEffect(() => {
    if (locations.length === 0 || !window.google?.maps) return;
    const geocodeAll = async () => {
      const updated = await Promise.all(
        locations.map(async (loc) => {
          if (loc.lat && loc.lng) return loc;
          try {
            const coords = await geocodeAddress(loc.address);
            return { ...loc, ...coords };
          } catch {
            return loc;
          }
        })
      );
      setLocations(updated);
    };
    geocodeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.length]);

  // ── Compute distances when user position changes ───────────────────────
  const sortedLocations = userPos
    ? [...locations]
        .filter((l) => l.lat && l.lng)
        .map((l) => ({
          ...l,
          distance: distanceKm(userPos.lat, userPos.lng, l.lat, l.lng),
        }))
        .sort((a, b) => a.distance - b.distance)
    : locations.filter((l) => l.lat && l.lng);

  // ── Init Google Map ────────────────────────────────────────────────────
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps || mapInstance.current) return;

    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: -33.8688, lng: 151.2093 }, // Default: Sydney
      zoom: 10,
      minZoom: 5,
      maxZoom: 18,
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
      restriction: {
        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
        strictBounds: true,
      },
    });

    infoWindowRef.current = new window.google.maps.InfoWindow();
  }, []);

  useEffect(() => {
    const checkGoogle = setInterval(() => {
      if (window.google?.maps) {
        clearInterval(checkGoogle);
        initMap();
      }
    }, 200);
    return () => clearInterval(checkGoogle);
  }, [initMap]);

  // ── Place markers on map when locations update ─────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    // Clear old clusterer
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }

    const locsWithCoords = locations.filter((l) => l.lat && l.lng);
    if (locsWithCoords.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();

    locsWithCoords.forEach((loc) => {
      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstance.current,
        title: loc.name,
        icon: {
          url: "/logo-sticker.png",
          scaledSize: new window.google.maps.Size(32, 32),
          anchor: new window.google.maps.Point(16, 16),
        },
      });

      marker.addListener("click", () => {
        setSelectedLoc(loc.id);
        const dist = loc.distance ? `${loc.distance.toFixed(1)} km away` : "";
        infoWindowRef.current.setContent(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif;padding:8px 6px;max-width:270px;">
            <div style="font-weight:800;font-size:15px;color:#1a1d23;margin-bottom:6px;padding-right:8px;">${loc.name}</div>
            <div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:6px;">${loc.address}</div>
            ${loc.phone ? `<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${loc.phone}</div>` : ""}
            ${dist ? `<div style="font-size:12px;font-weight:700;color:#E25D25;margin-top:6px;">${dist}</div>` : ""}
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.address)}" target="_blank"
              style="display:inline-block;margin-top:10px;padding:8px 16px;border-radius:8px;background:#E25D25;color:#fff;font-size:12px;font-weight:700;text-decoration:none;">
              Get Directions
            </a>
          </div>
        `);
        infoWindowRef.current.open(mapInstance.current, marker);
      });

      bounds.extend({ lat: loc.lat, lng: loc.lng });
      markersRef.current.push(marker);
    });

    // Initialize MarkerClusterer
    if (window.markerClusterer && markersRef.current.length > 0) {
      clustererRef.current = new window.markerClusterer.MarkerClusterer({
        map: mapInstance.current,
        markers: markersRef.current,
        algorithmOptions: {
          maxZoom: 14,
          radius: 120,
        },
        renderer: {
          render: ({ count, position }) => {
            const zoom = mapInstance.current.getZoom() || 5;
            const size = Math.min(18 + Math.log2(count) * 5, 36);
            return new window.google.maps.Marker({
              position,
              label: {
                text: String(count),
                color: "#fff",
                fontWeight: "800",
                fontSize: count > 99 ? "11px" : "12px",
                fontFamily: "Plus Jakarta Sans, sans-serif",
              },
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: "#E25D25",
                fillOpacity: 0.9,
                strokeColor: "#fff",
                strokeWeight: 2.5,
                scale: size,
                labelOrigin: new window.google.maps.Point(0, 0),
              },
              zIndex: Number(window.google.maps.Marker.MAX_ZINDEX) + count,
            });
          },
        },
        onClusterClick: (event, cluster, map) => {
          map.fitBounds(cluster.bounds, { padding: 60 });
        },
      });
    }

    if (userPos) {
      bounds.extend(userPos);
    }

    mapInstance.current.fitBounds(bounds, { padding: 60 });

    // Clamp zoom to min/max
    const idleListener = mapInstance.current.addListener("idle", () => {
      const z = mapInstance.current.getZoom();
      if (z < 5) mapInstance.current.setZoom(5);
      window.google.maps.event.removeListener(idleListener);
    });

    if (locsWithCoords.length === 1 && !userPos) {
      mapInstance.current.setZoom(14);
    }
  }, [locations, userPos]);

  // ── Place/update user marker ───────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !userPos || !window.google?.maps) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userPos);
    } else {
      userMarkerRef.current = new window.google.maps.Marker({
        position: userPos,
        map: mapInstance.current,
        title: "Your location",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
        zIndex: 999,
      });
    }
  }, [userPos]);

  // ── Init search autocomplete ───────────────────────────────────────────
  useEffect(() => {
    if (!searchInputRef.current || !window.google?.maps?.places) return;
    const checkReady = setInterval(() => {
      if (window.google?.maps?.places) {
        clearInterval(checkReady);
        autocompleteRef.current = new window.google.maps.places.Autocomplete(searchInputRef.current, {
          types: ["geocode"],
          fields: ["geometry", "formatted_address"],
        });
        autocompleteRef.current.addListener("place_changed", () => {
          const place = autocompleteRef.current.getPlace();
          if (place.geometry) {
            const pos = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            };
            setUserPos(pos);
            setLocStatus("located");

            // Zoom to area showing searched location + nearby centres
            if (mapInstance.current) {
              const bounds = new window.google.maps.LatLngBounds();
              bounds.extend(pos);

              // Include the 3 nearest locations in the bounds
              const nearby = locations
                .filter((l) => l.lat && l.lng)
                .map((l) => ({ ...l, dist: distanceKm(pos.lat, pos.lng, l.lat, l.lng) }))
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 3);

              nearby.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));

              mapInstance.current.fitBounds(bounds, { padding: 80 });

              // Limit max zoom so it doesn't zoom in too much
              const listener = mapInstance.current.addListener("idle", () => {
                if (mapInstance.current.getZoom() > 13) {
                  mapInstance.current.setZoom(13);
                }
                window.google.maps.event.removeListener(listener);
              });
            }
          }
        });
      }
    }, 300);
    return () => clearInterval(checkReady);
  }, [locations]);

  // ── Geolocate user ────────────────────────────────────────────────────
  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setLocStatus("error");
      return;
    }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("located");
      },
      (err) => {
        if (err.code === 1) setLocStatus("denied");
        else setLocStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── Auto-geolocate on mount ───────────────────────────────────────────
  useEffect(() => {
    handleGeolocate();
  }, []);

  // ── Click a location in the list ──────────────────────────────────────
  const handleSelectLocation = (loc) => {
    setSelectedLoc(loc.id);
    if (mapInstance.current && loc.lat && loc.lng) {
      mapInstance.current.panTo({ lat: loc.lat, lng: loc.lng });
      mapInstance.current.setZoom(15);
      // Trigger marker click
      const marker = markersRef.current.find(
        (m) => Math.abs(m.getPosition().lat() - loc.lat) < 0.0001
      );
      if (marker) {
        window.google.maps.event.trigger(marker, "click");
      }
    }
    // On mobile, show map
    if (window.innerWidth <= 768) {
      setShowPanel(false);
    }
  };

  const statusText = {
    idle: { dot: "gray", text: "Enter your address or allow location access to find your nearest centre" },
    locating: { dot: "orange", text: "Finding your location..." },
    located: { dot: "green", text: "Showing centres nearest to you" },
    denied: { dot: "orange", text: "Location access denied — search an address above" },
    error: { dot: "orange", text: "Couldn't detect location — search an address above" },
  };

  const status = statusText[locStatus];

  return (
    <>
      <style>{css}</style>
      <div className="fac">
        {/* ── Side Panel ─────────────────────────────────── */}
        <div className={`fac-panel ${showPanel ? "" : "hidden"}`}>
          {/* Header */}
          <div className="fac-header">
            <div className="fac-header-top">
              <img src="/logo-sticker.png" alt="Success Tutoring" className="fac-logo" />
              <div className="fac-brand">
                <span>Success</span> Tutoring
              </div>
            </div>
            <div className="fac-tagline">Find your nearest tutoring centre</div>
          </div>

          {/* Search */}
          <div className="fac-search">
            <div className="fac-search-row">
              <div className="fac-search-input-wrap">
                <Icon d={ic.search} size={16} />
                <input
                  ref={searchInputRef}
                  className="fac-search-input"
                  placeholder="Search by suburb or address..."
                  type="text"
                />
              </div>
              <button
                className="fac-locate-btn"
                onClick={handleGeolocate}
                disabled={locStatus === "locating"}
                title="Use my location"
              >
                <Icon d={ic.crosshair} size={18} />
              </button>
            </div>
            <div className="fac-status">
              <div className={`fac-status-dot ${status.dot}`} />
              {status.text}
            </div>
          </div>

          {/* Location List */}
          <div className="fac-list">
            {loading ? (
              <div className="fac-loading">Loading centres...</div>
            ) : sortedLocations.length === 0 ? (
              <div className="fac-empty">
                <div className="fac-empty-icon">📍</div>
                <div className="fac-empty-text">No centres found</div>
              </div>
            ) : (
              <>
                <div className="fac-list-header">
                  {userPos ? `${sortedLocations.length} centres near you` : `${sortedLocations.length} centres`}
                </div>
                {sortedLocations.map((loc) => (
                  <div
                    key={loc.id}
                    className={`fac-loc ${selectedLoc === loc.id ? "active" : ""}`}
                    onClick={() => handleSelectLocation(loc)}
                  >
                    <div className="fac-loc-icon">
                      <Icon d={ic.mapPin} size={18} />
                    </div>
                    <div className="fac-loc-info">
                      <div className="fac-loc-name">{loc.name}</div>
                      <div className="fac-loc-address">{loc.address}</div>
                      <div className="fac-loc-meta">
                        {loc.phone && (
                          <div className="fac-loc-meta-item">
                            <Icon d={ic.phone} size={11} /> {loc.phone}
                          </div>
                        )}
                        {loc.email && (
                          <div className="fac-loc-meta-item">
                            <Icon d={ic.mail} size={11} /> {loc.email}
                          </div>
                        )}
                      </div>
                      <div className="fac-loc-actions">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fac-loc-action-btn"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon d={ic.directions} size={12} /> Directions
                        </a>
                        {loc.phone && (
                          <a
                            href={`tel:${loc.phone.replace(/\s/g, "")}`}
                            className="fac-loc-action-btn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon d={ic.phone} size={12} /> Call
                          </a>
                        )}
                      </div>
                    </div>
                    {loc.distance !== undefined && (
                      <div className="fac-loc-distance">{loc.distance.toFixed(1)} km</div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Back to portal */}
          <button className="fac-back" onClick={() => (window.location.href = "/")}>
            <Icon d={ic.back} size={14} /> Back to portal
          </button>
        </div>

        {/* ── Map ──────────────────────────────────────────── */}
        <div className="fac-map">
          <div ref={mapRef} className="fac-map-el" />
        </div>

        {/* ── Mobile Toggle ──────────────────────────────── */}
        <button className="fac-mobile-toggle" onClick={() => setShowPanel(!showPanel)}>
          <Icon d={showPanel ? ic.mapPin : ic.search} size={16} />
          {showPanel ? "Show Map" : "Show List"}
        </button>
      </div>
    </>
  );
}
