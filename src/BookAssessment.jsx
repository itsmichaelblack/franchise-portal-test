// src/BookAssessment.jsx
// Public-facing 3-step booking flow:
//   Step 1 — Find a location (geolocation + Google Places search)
//   Step 2 — Pick a date & time (based on Firestore availability)
//   Step 3 — Confirmation

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, getDoc, addDoc, doc, query, orderBy, where, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps) return reject("Google Maps not loaded");
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else reject("Could not geocode");
    });
  });
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DAYS_MAP = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
const ASSESSMENT_DURATION = 40; // minutes

function generateTimeSlots(start, end, duration, buffer) {
  const slots = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (current + duration <= endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += duration + buffer;
  }
  return slots;
}

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDate(d) {
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function buildCalendarUrl(location, date, time) {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(date);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + ASSESSMENT_DURATION * 60000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = encodeURIComponent(`Free Assessment - ${location.name}`);
  const details = encodeURIComponent(`Your free 40-minute assessment at ${location.name}.\nAddress: ${location.address}`);
  const loc = encodeURIComponent(location.address);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${loc}`;
}

function getYouTubeEmbedId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ic = {
  mapPin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35",
  crosshair: "M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83",
  calendar: "M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  check: "M20 6L9 17l-5-5",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  back: "M15 18l-6-6 6-6",
  forward: "M9 18l6-6-6-6",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; }

  .ba {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    min-height: 100vh;
    min-height: 100dvh;
    width: 100vw;
    background: linear-gradient(165deg, #fff9f5 0%, #f0fafa 40%, #f7f8fa 100%);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ─────────────────────────────────────────── */
  .ba-header {
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    background: rgba(255,255,255,0.8);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .ba-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ba-logo img { width: 36px; height: 36px; object-fit: contain; }
  .ba-logo-text { font-size: 17px; font-weight: 800; color: #1a1d23; }
  .ba-logo-text span { color: #E25D25; }

  /* ── Steps indicator ─────────────────────────────────── */
  .ba-steps {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .ba-step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #9ca3af;
    position: relative;
  }
  .ba-step.active { color: #E25D25; }
  .ba-step.done { color: #059669; }
  .ba-step-num {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    border: 2px solid #d1d5db;
    background: #fff;
    flex-shrink: 0;
  }
  .ba-step.active .ba-step-num { border-color: #E25D25; background: #E25D25; color: #fff; }
  .ba-step.done .ba-step-num { border-color: #059669; background: #059669; color: #fff; }
  .ba-step-line {
    width: 32px;
    height: 2px;
    background: #d1d5db;
    flex-shrink: 0;
  }
  .ba-step-line.done { background: #059669; }

  /* ── Content area ─────────────────────────────────────── */
  .ba-content {
    flex: 1;
    display: flex;
    justify-content: center;
    padding: 40px 24px 60px;
  }
  .ba-card {
    width: 100%;
    max-width: 640px;
  }
  .ba-card-title {
    font-size: 26px;
    font-weight: 800;
    color: #1a1d23;
    margin-bottom: 6px;
  }
  .ba-card-desc {
    font-size: 15px;
    color: #6b7280;
    margin-bottom: 28px;
    line-height: 1.5;
  }

  /* ── Step 1: Location picker ─────────────────────────── */
  .ba-search-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .ba-search-wrap {
    flex: 1;
    position: relative;
  }
  .ba-search-wrap svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    pointer-events: none;
  }
  .ba-search-input {
    width: 100%;
    padding: 13px 14px 13px 42px;
    border-radius: 12px;
    border: 2px solid #e8eaed;
    font-family: inherit;
    font-size: 15px;
    color: #1a1d23;
    background: #fff;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .ba-search-input:focus {
    border-color: #E25D25;
    box-shadow: 0 0 0 4px rgba(226,93,37,0.08);
  }
  .ba-locate-btn {
    padding: 0 16px;
    border-radius: 12px;
    border: 2px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    color: #E25D25;
    display: flex;
    align-items: center;
    transition: all 0.15s;
  }
  .ba-locate-btn:hover { background: #fdf0ea; border-color: #E25D25; }
  .ba-status {
    font-size: 12px;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 20px;
  }
  .ba-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ba-status-dot.green { background: #059669; }
  .ba-status-dot.orange { background: #E25D25; }
  .ba-status-dot.gray { background: #9ca3af; }

  .ba-locs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ba-loc {
    padding: 18px 20px;
    border-radius: 14px;
    border: 2px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    display: flex;
    gap: 14px;
    transition: all 0.2s;
    align-items: flex-start;
  }
  .ba-loc:hover { border-color: #f5c9b0; background: #fffaf7; }
  .ba-loc.selected { border-color: #E25D25; background: #fdf0ea; box-shadow: 0 0 0 4px rgba(226,93,37,0.08); }
  .ba-loc-icon {
    width: 42px;
    height: 42px;
    border-radius: 11px;
    background: #fdf0ea;
    color: #E25D25;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ba-loc.selected .ba-loc-icon { background: #E25D25; color: #fff; }
  .ba-loc-info { flex: 1; }
  .ba-loc-name { font-size: 15px; font-weight: 700; color: #1a1d23; }
  .ba-loc-addr { font-size: 13px; color: #6b7280; margin-top: 3px; line-height: 1.4; }
  .ba-loc-dist { font-size: 13px; font-weight: 700; color: #E25D25; flex-shrink: 0; margin-top: 2px; }

  /* ── Step 2: Date/Time picker ────────────────────────── */
  .ba-date-row {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .ba-date-btn {
    min-width: 80px;
    padding: 14px 12px;
    border-radius: 12px;
    border: 2px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
    font-family: inherit;
    flex-shrink: 0;
  }
  .ba-date-btn:hover { border-color: #f5c9b0; }
  .ba-date-btn.selected { border-color: #E25D25; background: #fdf0ea; }
  .ba-date-btn.disabled { opacity: 0.35; cursor: not-allowed; }
  .ba-date-day { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
  .ba-date-btn.selected .ba-date-day { color: #E25D25; }
  .ba-date-num { font-size: 20px; font-weight: 800; color: #1a1d23; margin-top: 2px; }
  .ba-date-btn.selected .ba-date-num { color: #E25D25; }
  .ba-date-month { font-size: 11px; color: #9ca3af; margin-top: 1px; }
  .ba-date-btn.selected .ba-date-month { color: #E25D25; }

  .ba-time-label {
    font-size: 13px;
    font-weight: 700;
    color: #1a1d23;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ba-times {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .ba-time-btn {
    padding: 12px;
    border-radius: 10px;
    border: 2px solid #e8eaed;
    background: #fff;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    color: #1a1d23;
    text-align: center;
    transition: all 0.15s;
  }
  .ba-time-btn:hover { border-color: #f5c9b0; background: #fffaf7; }
  .ba-time-btn.selected { border-color: #E25D25; background: #E25D25; color: #fff; }
  .ba-no-slots {
    padding: 32px;
    text-align: center;
    color: #9ca3af;
    font-size: 14px;
    background: #f7f8fa;
    border-radius: 12px;
    border: 1px dashed #d1d5db;
  }
  .ba-selected-info {
    margin-top: 20px;
    padding: 16px 20px;
    border-radius: 12px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    font-size: 14px;
    color: #059669;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Step 3: Form + Confirmation ─────────────────────── */
  .ba-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  .ba-form-group { display: flex; flex-direction: column; gap: 6px; }
  .ba-form-group.full { grid-column: 1 / -1; }
  .ba-form-label { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .ba-form-input {
    padding: 12px 14px;
    border-radius: 10px;
    border: 2px solid #e8eaed;
    font-family: inherit;
    font-size: 14px;
    color: #1a1d23;
    background: #fff;
    outline: none;
    transition: border-color 0.2s;
  }
  .ba-form-input:focus { border-color: #E25D25; }
  .ba-input-error { border-color: #dc2626 !important; }
  .ba-field-error { color: #dc2626; font-size: 12px; margin-top: 4px; }

  .ba-summary {
    padding: 20px;
    border-radius: 14px;
    background: #fff;
    border: 1px solid #e8eaed;
    margin-bottom: 24px;
  }
  .ba-summary-title { font-size: 13px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
  .ba-summary-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
    font-size: 14px;
    color: #1a1d23;
  }
  .ba-summary-row:last-child { border-bottom: none; }
  .ba-summary-row svg { color: #E25D25; flex-shrink: 0; }
  .ba-summary-label { color: #6b7280; min-width: 80px; }

  /* ── Confirmation screen ─────────────────────────────── */
  .ba-confirm {
    text-align: center;
    padding: 40px 20px;
  }
  .ba-confirm-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: #ecfdf5;
    color: #059669;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
  }
  .ba-confirm-title {
    font-size: 24px;
    font-weight: 800;
    color: #1a1d23;
    margin-bottom: 8px;
  }
  .ba-confirm-desc {
    font-size: 15px;
    color: #6b7280;
    margin-bottom: 32px;
    line-height: 1.5;
  }

  /* ── Navigation buttons ──────────────────────────────── */
  .ba-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 28px;
  }
  .ba-btn {
    padding: 13px 28px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }
  .ba-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .ba-btn-primary { background: #E25D25; color: #fff; box-shadow: 0 4px 14px rgba(226,93,37,0.3); }
  .ba-btn-primary:hover:not(:disabled) { background: #c94f1f; }
  .ba-btn-ghost { background: transparent; color: #6b7280; }
  .ba-btn-ghost:hover { color: #1a1d23; }
  .ba-btn-success { background: #059669; color: #fff; box-shadow: 0 4px 14px rgba(5,150,105,0.3); }

  .ba-loading { text-align: center; padding: 48px; color: #9ca3af; font-size: 15px; }

  /* ── Responsive ──────────────────────────────────────── */
  @media (max-width: 640px) {
    .ba-header { padding: 14px 16px; }
    .ba-step-text { display: none; }
    .ba-content { padding: 24px 16px 40px; }
    .ba-card-title { font-size: 22px; }
    .ba-form-grid { grid-template-columns: 1fr; }
    .ba-nav { flex-direction: column-reverse; gap: 10px; }
    .ba-nav .ba-btn { width: 100%; justify-content: center; }
    .ba-date-row { gap: 6px; }
    .ba-date-btn { min-width: 68px; padding: 10px 8px; }
  }

  /* ── Google autocomplete ─────────────────────────────── */
  .pac-container {
    border-radius: 12px !important;
    border: 1px solid #e8eaed !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
    margin-top: 4px !important;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important;
  }
  .pac-item { padding: 10px 14px !important; font-size: 13px !important; }
  .pac-item:hover { background: #fdf0ea !important; }
`;

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BookAssessment() {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState(null);
  const [locStatus, setLocStatus] = useState("idle");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const searchRef = useRef(null);
  const acRef = useRef(null);

  // Step 2 state
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [existingBookings, setExistingBookings] = useState([]);

  // Step 3 state
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [children, setChildren] = useState([{ name: "", grade: "" }]);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [bookingRef, setBookingRef] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // HQ Settings (YouTube video)
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // ── Load locations ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "locations"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const locs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLocations(locs);

        // Check for ?location=ID parameter to auto-select and skip step 1
        const params = new URLSearchParams(window.location.search);
        const preselectedId = params.get("location");
        if (preselectedId) {
          const match = locs.find((l) => l.id === preselectedId);
          if (match) {
            setSelectedLocation(match);
            setStep(2);
          }
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
    // Load HQ settings
    const loadSettings = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "hq"));
        if (snap.exists() && snap.data().youtubeUrl) {
          setYoutubeUrl(snap.data().youtubeUrl);
        }
      } catch (e) { console.error("Failed to load settings:", e); }
    };
    loadSettings();
  }, []);

  // ── Geocode locations ──────────────────────────────────────────────────
  useEffect(() => {
    if (!locations.length || !window.google?.maps) return;
    const geo = async () => {
      const updated = await Promise.all(
        locations.map(async (l) => {
          if (l.lat && l.lng) return l;
          try { return { ...l, ...(await geocodeAddress(l.address)) }; } catch { return l; }
        })
      );
      setLocations(updated);
    };
    geo();
  }, [locations.length]);

  // ── Geolocate user ────────────────────────────────────────────────────
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) { setLocStatus("error"); return; }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocStatus("located"); },
      (e) => setLocStatus(e.code === 1 ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { handleGeolocate(); }, [handleGeolocate]);

  // ── Search autocomplete ───────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      if (searchRef.current && window.google?.maps?.places) {
        clearInterval(iv);
        acRef.current = new window.google.maps.places.Autocomplete(searchRef.current, {
          types: ["geocode"],
          fields: ["geometry"],
        });
        acRef.current.addListener("place_changed", () => {
          const place = acRef.current.getPlace();
          if (place.geometry) {
            setUserPos({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
            setLocStatus("located");
          }
        });
      }
    }, 300);
    return () => clearInterval(iv);
  }, []);

  // ── Sorted locations ──────────────────────────────────────────────────
  const sortedLocs = userPos
    ? [...locations].filter((l) => l.lat && l.lng).map((l) => ({ ...l, distance: distanceKm(userPos.lat, userPos.lng, l.lat, l.lng) })).sort((a, b) => a.distance - b.distance)
    : locations.filter((l) => l.lat && l.lng);

  // ── Load availability when location selected & moving to step 2 ───────
  useEffect(() => {
    if (step !== 2 || !selectedLocation) return;
    const load = async () => {
      setAvailLoading(true);
      try {
        const snap = await getDoc(doc(db, "availability", selectedLocation.id));
        setAvailability(snap.exists() ? snap.data() : null);

        // Load existing bookings for this location
        const bSnap = await getDocs(query(collection(db, "bookings"), where("locationId", "==", selectedLocation.id)));
        setExistingBookings(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); setAvailability(null); }
      setAvailLoading(false);
    };
    load();
  }, [step, selectedLocation]);

  // ── Generate next 14 days ─────────────────────────────────────────────
  const dates = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d);
  }

  // ── Get time slots for selected date ──────────────────────────────────
  const getTimeSlotsForDate = (date) => {
    if (!availability?.schedule || !date) return [];
    const dayName = DAYS_MAP[date.getDay()];
    const daySched = availability.schedule.find((s) => s.day === dayName);
    if (!daySched?.enabled) return [];
    const buffer = availability.bufferMinutes || 0;
    const slots = generateTimeSlots(daySched.start, daySched.end, ASSESSMENT_DURATION, buffer);

    // Filter out already booked slots
    const dateStr = date.toISOString().split("T")[0];
    const booked = existingBookings
      .filter(b => b.date === dateStr)
      .map(b => b.time);

    return slots.filter(s => !booked.includes(s));
  };

  const isDayAvailable = (date) => {
    if (!availability?.schedule) return false;
    const dayName = DAYS_MAP[date.getDay()];
    const daySched = availability.schedule.find((s) => s.day === dayName);
    if (!daySched?.enabled) return false;
    // Check if this specific date is blocked
    const dateStr = date.toISOString().split("T")[0];
    if (availability.unavailableDates?.some(u => u.date === dateStr)) return false;
    return true;
  };

  const timeSlots = getTimeSlotsForDate(selectedDate);

  // ── Submit booking ────────────────────────────────────────────────────
  // ── Grade levels based on location country ─────────────────────────────
  const isNZ = selectedLocation && (selectedLocation.address || "").toLowerCase().includes("new zealand");
  const GRADES = isNZ
    ? ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "Grade 13"]
    : ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

  const addChild = () => setChildren([...children, { name: "", grade: "" }]);
  const removeChild = (i) => setChildren(children.filter((_, idx) => idx !== i));
  const updateChild = (i, field, val) => {
    const updated = [...children];
    updated[i] = { ...updated[i], [field]: val };
    setChildren(updated);
  };

  // ── Validation ────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[+\d\s()-]{6,20}$/;

    if (!parentFirst.trim()) errors.parentFirst = "First name is required";
    if (!parentLast.trim()) errors.parentLast = "Last name is required";
    if (!parentEmail.trim()) errors.parentEmail = "Email is required";
    else if (!emailRegex.test(parentEmail.trim())) errors.parentEmail = "Enter a valid email address";
    if (!parentPhone.trim()) errors.parentPhone = "Phone number is required";
    else if (!phoneRegex.test(parentPhone.trim())) errors.parentPhone = "Enter a valid phone number";

    children.forEach((child, i) => {
      if (!child.name.trim()) errors[`child_${i}_name`] = "Child's name is required";
      if (!child.grade) errors[`child_${i}_grade`] = "Please select a grade level";
    });

    // Simple spam check: honeypot is handled via hidden field, also check for URLs in names
    const urlRegex = /https?:\/\/|www\./i;
    if (urlRegex.test(parentFirst) || urlRegex.test(parentLast)) errors.spam = "Invalid input detected";
    children.forEach((child) => {
      if (urlRegex.test(child.name)) errors.spam = "Invalid input detected";
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const bookingData = {
        locationId: selectedLocation.id,
        locationName: selectedLocation.name,
        locationAddress: selectedLocation.address,
        date: selectedDate.toISOString().split("T")[0],
        time: selectedTime,
        duration: ASSESSMENT_DURATION,
        parentFirstName: parentFirst.trim(),
        parentLastName: parentLast.trim(),
        customerName: `${parentFirst.trim()} ${parentLast.trim()}`,
        customerEmail: parentEmail.trim(),
        customerPhone: parentPhone.trim(),
        children: children.map((c) => ({ name: c.name.trim(), grade: c.grade })),
        comments: comments.trim(),
        notes: comments.trim(),
        status: "confirmed",
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "bookings"), bookingData);
      setBookingRef(ref.id);
      setConfirmed(true);
      setStep(4);
    } catch (e) {
      console.error("Booking failed:", e);
      alert("Failed to create booking. Please try again.");
    }
    setSubmitting(false);
  };

  // ── Status text ───────────────────────────────────────────────────────
  const statusMap = {
    idle: { dot: "gray", text: "Allow location access or search to find nearby centres" },
    locating: { dot: "orange", text: "Finding your location..." },
    located: { dot: "green", text: "Showing centres nearest to you" },
    denied: { dot: "orange", text: "Location denied — search your suburb above" },
    error: { dot: "orange", text: "Couldn't detect location — search above" },
  };
  const st = statusMap[locStatus];

  return (
    <>
      <style>{css}</style>
      <div className="ba">
        {/* ── Header ─────────────────────────────────── */}
        <div className="ba-header">
          <div className="ba-logo">
            <img src="/logo-sticker.png" alt="" />
            <div className="ba-logo-text"><span>Success</span> Tutoring</div>
          </div>
          <div className="ba-steps">
            {[
              { n: 1, label: "Location" },
              { n: 2, label: "Date & Time" },
              { n: 3, label: "Details" },
            ].map((s, i) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && <div className={`ba-step-line ${step > s.n - 1 ? "done" : ""}`} />}
                <div className={`ba-step ${step === s.n ? "active" : step > s.n ? "done" : ""}`}>
                  <div className="ba-step-num">
                    {step > s.n ? <Icon d={ic.check} size={12} /> : s.n}
                  </div>
                  <span className="ba-step-text">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────── */}
        <div className="ba-content">
          <div className="ba-card">

            {/* ═══ STEP 1: Find Location ═══ */}
            {step === 1 && (
              <>
                <div className="ba-card-title">Find your nearest centre</div>
                <div className="ba-card-desc">Select the Success Tutoring location you'd like to book your free assessment at.</div>

                <div className="ba-search-row">
                  <div className="ba-search-wrap">
                    <Icon d={ic.search} size={16} />
                    <input ref={searchRef} className="ba-search-input" placeholder="Search by suburb or address..." type="text" />
                  </div>
                  <button className="ba-locate-btn" onClick={handleGeolocate} title="Use my location">
                    <Icon d={ic.crosshair} size={18} />
                  </button>
                </div>
                <div className="ba-status">
                  <div className={`ba-status-dot ${st.dot}`} />
                  {st.text}
                </div>

                {loading ? (
                  <div className="ba-loading">Loading centres...</div>
                ) : (
                  <div className="ba-locs">
                    {sortedLocs.slice(0, 3).map((loc) => (
                      <div
                        key={loc.id}
                        className={`ba-loc ${selectedLocation?.id === loc.id ? "selected" : ""}`}
                        onClick={() => { setSelectedLocation(loc); setSelectedDate(null); setSelectedTime(null); setStep(2); }}
                      >
                        <div className="ba-loc-icon"><Icon d={ic.mapPin} size={18} /></div>
                        <div className="ba-loc-info">
                          <div className="ba-loc-name">{loc.name}</div>
                          <div className="ba-loc-addr">{loc.address}</div>
                        </div>
                        {loc.distance !== undefined && (
                          <div className="ba-loc-dist">{loc.distance.toFixed(1)} km</div>
                        )}
                      </div>
                    ))}
                    {sortedLocs.length === 0 && (
                      <div className="ba-no-slots">No centres found. Please try a different search.</div>
                    )}
                  </div>
                )}

                <div className="ba-nav">
                  <button className="ba-btn ba-btn-ghost" onClick={() => (window.location.href = "/")}>
                    <Icon d={ic.back} size={16} /> Back
                  </button>
                  <div />
                </div>
              </>
            )}

            {/* ═══ STEP 2: Date & Time ═══ */}
            {step === 2 && (
              <>
                <div className="ba-card-title">Choose a date & time</div>
                <div className="ba-card-desc">
                  Book a <strong>40-minute</strong> free assessment at <strong>{selectedLocation?.name}</strong>.
                </div>

                {availLoading ? (
                  <div className="ba-loading">Loading available times...</div>
                ) : !availability || (() => {
                  // Check if ANY day in next 14 has slots
                  const hasAnySlots = dates.some(d => {
                    const dayName = DAYS_MAP[d.getDay()];
                    const daySched = availability?.schedule?.find(s => s.day === dayName);
                    if (!daySched?.enabled) return false;
                    const buffer = availability.bufferMinutes || 0;
                    const allSlots = generateTimeSlots(daySched.start, daySched.end, ASSESSMENT_DURATION, buffer);
                    const dateStr = d.toISOString().split("T")[0];
                    const booked = existingBookings.filter(b => b.date === dateStr).map(b => b.time);
                    return allSlots.filter(s => !booked.includes(s)).length > 0;
                  });
                  return !hasAnySlots;
                })() ? (
                  <div>
                    <div style={{ padding: "28px 24px", borderRadius: 14, background: "#fff", border: "2px solid #fde8b0", marginBottom: 20, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1d23", marginBottom: 8 }}>
                        {selectedLocation?.name} isn't showing any availability
                      </div>
                      <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                        Please contact them directly on{" "}
                        <a href={`tel:${selectedLocation?.phone?.replace(/\s/g, "")}`} style={{ color: "#E25D25", fontWeight: 700, textDecoration: "none" }}>
                          {selectedLocation?.phone || "their listed number"}
                        </a>{" "}
                        or try one of the centres below.
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                      Other centres nearby
                    </div>
                    <div className="ba-locs">
                      {sortedLocs.filter(l => l.id !== selectedLocation?.id).slice(0, 2).map((loc) => (
                        <div
                          key={loc.id}
                          className="ba-loc"
                          onClick={() => { setSelectedLocation(loc); setAvailability(null); setAvailLoading(true); setSelectedDate(null); setSelectedTime(null); }}
                        >
                          <div className="ba-loc-icon"><Icon d={ic.mapPin} size={18} /></div>
                          <div className="ba-loc-info">
                            <div className="ba-loc-name">{loc.name}</div>
                            <div className="ba-loc-addr">{loc.address}</div>
                          </div>
                          {loc.distance !== undefined && (
                            <div className="ba-loc-dist">{loc.distance.toFixed(1)} km</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ba-time-label">
                      <Icon d={ic.calendar} size={15} /> Select a date
                    </div>
                    <div className="ba-date-row">
                      {dates.map((d) => {
                        const available = isDayAvailable(d);
                        const isSelected = selectedDate?.toDateString() === d.toDateString();
                        return (
                          <button
                            key={d.toISOString()}
                            className={`ba-date-btn ${isSelected ? "selected" : ""} ${!available ? "disabled" : ""}`}
                            onClick={() => { if (available) { setSelectedDate(d); setSelectedTime(null); } }}
                            disabled={!available}
                          >
                            <div className="ba-date-day">{d.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                            <div className="ba-date-num">{d.getDate()}</div>
                            <div className="ba-date-month">{d.toLocaleDateString("en-AU", { month: "short" })}</div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedDate && (
                      <>
                        <div className="ba-time-label" style={{ marginTop: 8 }}>
                          <Icon d={ic.clock} size={15} /> Available times — {formatDate(selectedDate)}
                        </div>
                        {timeSlots.length > 0 ? (
                          <div className="ba-times">
                            {timeSlots.map((t) => (
                              <button
                                key={t}
                                className={`ba-time-btn ${selectedTime === t ? "selected" : ""}`}
                                onClick={() => setSelectedTime(t)}
                              >
                                {formatTime(t)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="ba-no-slots">No available time slots for this date. Try another day.</div>
                        )}
                      </>
                    )}

                    {selectedTime && (
                      <div className="ba-selected-info">
                        <Icon d={ic.check} size={16} />
                        <strong>{formatTime(selectedTime)}</strong>&nbsp;—&nbsp;{formatTime(
                          (() => {
                            const [h, m] = selectedTime.split(":").map(Number);
                            const total = h * 60 + m + ASSESSMENT_DURATION;
                            return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                          })()
                        )}&nbsp;on {formatDate(selectedDate)}
                      </div>
                    )}
                  </>
                )}

                <div className="ba-nav">
                  <button className="ba-btn ba-btn-ghost" onClick={() => setStep(1)}>
                    <Icon d={ic.back} size={16} /> Back
                  </button>
                  <button
                    className="ba-btn ba-btn-primary"
                    disabled={!selectedDate || !selectedTime}
                    onClick={() => setStep(3)}
                  >
                    Continue <Icon d={ic.forward} size={16} />
                  </button>
                </div>
              </>
            )}

            {/* ═══ STEP 3: Customer Details ═══ */}
            {step === 3 && !confirmed && (
              <>
                <div className="ba-card-title">Your details</div>
                <div className="ba-card-desc">Fill in your details to confirm your free assessment booking.</div>

                <div className="ba-summary">
                  <div className="ba-summary-title">Booking Summary</div>
                  <div className="ba-summary-row">
                    <Icon d={ic.mapPin} size={16} />
                    <span className="ba-summary-label">Location</span>
                    <strong>{selectedLocation?.name}</strong>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.calendar} size={16} />
                    <span className="ba-summary-label">Date</span>
                    <strong>{selectedDate && formatDate(selectedDate)}</strong>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.clock} size={16} />
                    <span className="ba-summary-label">Time</span>
                    <strong>{selectedTime && formatTime(selectedTime)} ({ASSESSMENT_DURATION} min)</strong>
                  </div>
                </div>

                {formErrors.spam && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Invalid input detected. Please check your entries.</div>}

                <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Parent / Guardian Details</div>
                <div className="ba-form-grid">
                  <div className="ba-form-group">
                    <label className="ba-form-label">First Name *</label>
                    <input className={`ba-form-input ${formErrors.parentFirst ? 'ba-input-error' : ''}`} value={parentFirst} onChange={(e) => setParentFirst(e.target.value)} placeholder="First name" />
                    {formErrors.parentFirst && <div className="ba-field-error">{formErrors.parentFirst}</div>}
                  </div>
                  <div className="ba-form-group">
                    <label className="ba-form-label">Last Name *</label>
                    <input className={`ba-form-input ${formErrors.parentLast ? 'ba-input-error' : ''}`} value={parentLast} onChange={(e) => setParentLast(e.target.value)} placeholder="Last name" />
                    {formErrors.parentLast && <div className="ba-field-error">{formErrors.parentLast}</div>}
                  </div>
                  <div className="ba-form-group">
                    <label className="ba-form-label">Email *</label>
                    <input className={`ba-form-input ${formErrors.parentEmail ? 'ba-input-error' : ''}`} type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@example.com" />
                    {formErrors.parentEmail && <div className="ba-field-error">{formErrors.parentEmail}</div>}
                  </div>
                  <div className="ba-form-group">
                    <label className="ba-form-label">Phone *</label>
                    <input className={`ba-form-input ${formErrors.parentPhone ? 'ba-input-error' : ''}`} type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="0400 000 000" />
                    {formErrors.parentPhone && <div className="ba-field-error">{formErrors.parentPhone}</div>}
                  </div>
                </div>

                {/* Honeypot anti-spam field */}
                <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 8px' }}>Child Details</div>
                {children.map((child, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, padding: i > 0 ? '12px 0 0' : 0, borderTop: i > 0 ? '1px solid #e8eaed' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <label className="ba-form-label">Child's Full Name *</label>
                      <input
                        className={`ba-form-input ${formErrors[`child_${i}_name`] ? 'ba-input-error' : ''}`}
                        value={child.name}
                        onChange={(e) => updateChild(i, 'name', e.target.value)}
                        placeholder="Child's full name"
                      />
                      {formErrors[`child_${i}_name`] && <div className="ba-field-error">{formErrors[`child_${i}_name`]}</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ba-form-label">Grade Level *</label>
                      <select
                        className={`ba-form-input ${formErrors[`child_${i}_grade`] ? 'ba-input-error' : ''}`}
                        value={child.grade}
                        onChange={(e) => updateChild(i, 'grade', e.target.value)}
                        style={{ appearance: 'auto' }}
                      >
                        <option value="">Select grade...</option>
                        {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {formErrors[`child_${i}_grade`] && <div className="ba-field-error">{formErrors[`child_${i}_grade`]}</div>}
                    </div>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChild(i)}
                        style={{ marginTop: 22, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 6px' }}
                        title="Remove child"
                      >&times;</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addChild}
                  style={{ background: 'none', border: '1px dashed #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#E25D25', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}
                >
                  + Add Another Child
                </button>

                <div style={{ marginTop: 8 }}>
                  <label className="ba-form-label">Additional Comments (optional)</label>
                  <textarea
                    className="ba-form-input"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Any additional information, e.g. learning goals, specific subjects..."
                    rows={3}
                    style={{ resize: 'vertical', minHeight: 60 }}
                  />
                </div>

                <div className="ba-nav">
                  <button className="ba-btn ba-btn-ghost" onClick={() => setStep(2)}>
                    <Icon d={ic.back} size={16} /> Back
                  </button>
                  <button
                    className="ba-btn ba-btn-primary"
                    disabled={submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Booking..." : "Confirm Booking"} <Icon d={ic.check} size={16} />
                  </button>
                </div>
              </>
            )}

            {/* ═══ STEP 4: Confirmation ═══ */}
            {step === 4 && confirmed && (
              <div className="ba-confirm">
                <div className="ba-confirm-icon">
                  <Icon d={ic.check} size={36} />
                </div>
                <div className="ba-confirm-title">Assessment Booked!</div>
                <div className="ba-confirm-desc">
                  Your free 40-minute assessment has been confirmed at <strong>{selectedLocation?.name}</strong> on <strong>{selectedDate && formatDate(selectedDate)}</strong> at <strong>{selectedTime && formatTime(selectedTime)}</strong>.
                </div>

                <div className="ba-summary" style={{ textAlign: "left", maxWidth: 400, margin: "0 auto 24px" }}>
                  <div className="ba-summary-title">Confirmation Details</div>
                  <div className="ba-summary-row">
                    <Icon d={ic.mapPin} size={16} />
                    <span className="ba-summary-label">Location</span>
                    <span>{selectedLocation?.name}</span>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.mapPin} size={16} />
                    <span className="ba-summary-label">Address</span>
                    <span>{selectedLocation?.address}</span>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.calendar} size={16} />
                    <span className="ba-summary-label">Date</span>
                    <span>{selectedDate && formatDate(selectedDate)}</span>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.clock} size={16} />
                    <span className="ba-summary-label">Time</span>
                    <span>{selectedTime && formatTime(selectedTime)} ({ASSESSMENT_DURATION} min)</span>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.user} size={16} />
                    <span className="ba-summary-label">Name</span>
                    <span>{parentFirst} {parentLast}</span>
                  </div>
                  <div className="ba-summary-row">
                    <Icon d={ic.mail} size={16} />
                    <span className="ba-summary-label">Email</span>
                    <span>{parentEmail}</span>
                  </div>
                  {children.length > 0 && children.map((child, i) => (
                    <div className="ba-summary-row" key={i}>
                      <Icon d={ic.user} size={16} />
                      <span className="ba-summary-label">Child {children.length > 1 ? i + 1 : ''}</span>
                      <span>{child.name} ({child.grade})</span>
                    </div>
                  ))}
                  {bookingRef && (
                    <div className="ba-summary-row" style={{ color: "#9ca3af", fontSize: 12 }}>
                      <span>Ref: {bookingRef.slice(0, 8).toUpperCase()}</span>
                    </div>
                  )}
                </div>

                {/* Add to Calendar button */}
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
                  <a
                    href={buildCalendarUrl(selectedLocation, selectedDate, selectedTime)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ba-btn ba-btn-primary"
                    style={{ textDecoration: "none" }}
                  >
                    <Icon d={ic.calendar} size={16} /> Add to Google Calendar
                  </a>
                  <button className="ba-btn ba-btn-ghost" onClick={() => (window.location.href = "/")} style={{ border: "2px solid #e8eaed", borderRadius: 12 }}>
                    Back to Home
                  </button>
                </div>

                {/* YouTube Video */}
                {(() => {
                  const embedId = getYouTubeEmbedId(youtubeUrl);
                  if (!embedId) return null;
                  return (
                    <div style={{ maxWidth: 480, margin: "0 auto" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, textAlign: "left" }}>
                        While you wait — watch this
                      </div>
                      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${embedId}`}
                          title="Success Tutoring"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
