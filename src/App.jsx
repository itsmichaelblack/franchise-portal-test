import { useState, useEffect, useRef } from "react";
import { createLocation, updateLocation, deleteLocation, saveAvailability, getLocations } from "./services/firestore";

// ─── Simulated Data ───────────────────────────────────────────────────────────
const SIMULATED_USERS = {
  hq: [
    { id: 1, email: "master@hq.com", password: "master123", role: "master_admin", name: "Sarah Chen" },
    { id: 2, email: "admin@hq.com", password: "admin123", role: "admin", name: "James Wright" },
  ],
  franchise: [
    { id: 10, email: "partner@franchise.com", password: "partner123", name: "Alex Morgan", locationId: 1 },
  ],
};

const INITIAL_LOCATIONS = [];

const TIMEZONES = [
  "Pacific/Auckland", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
  "Australia/Perth", "Asia/Singapore", "Asia/Tokyo", "Asia/Dubai",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles",
  "America/Chicago", "America/Denver",
];

const COUNTRY_CODES = [
  { code: "+1", country: "US/CA" }, { code: "+44", country: "UK" },
  { code: "+61", country: "AU" }, { code: "+64", country: "NZ" },
  { code: "+65", country: "SG" }, { code: "+81", country: "JP" },
  { code: "+49", country: "DE" }, { code: "+33", country: "FR" },
  { code: "+971", country: "AE" }, { code: "+91", country: "IN" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const INITIAL_AVAILABILITY = DAYS.map((day, i) => ({
  day,
  enabled: i < 5,
  start: "09:00",
  end: "17:00",
}));

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ path, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);
const icons = {
  building: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  calendar: "M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  plus: "M12 5v14 M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18 M6 6l12 12",
  google: "M21.8 10.2H12v3.7h5.6c-.5 2.6-2.8 4.5-5.6 4.5a6.2 6.2 0 1 1 0-12.4c1.6 0 3 .6 4.1 1.6L18.7 5A10 10 0 1 0 22 12c0-.6-.1-1.2-.2-1.8z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  map: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4 M8 2v16 M16 6v16",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  menu: "M3 12h18 M3 6h18 M3 18h18",
  alert: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #root { width: 100%; min-height: 100vh; margin: 0; padding: 0; }

  :root {
    --orange: #E25D25;
    --orange-light: #f07040;
    --orange-pale: #fdf0ea;
    --orange-border: #f5c9b0;
    --teal: #6DCBCA;
    --teal-dark: #4aadac;
    --teal-pale: #edfafa;
    --teal-border: #b8e8e8;
    --yellow: #F9A72B;
    --yellow-pale: #fff8ec;
    --yellow-border: #fde8b0;
    --bg: #f7f8fa;
    --surface: #ffffff;
    --border: #e8eaed;
    --border-dark: #d0d4db;
    --text: #1a1d23;
    --text-muted: #6b7280;
    --text-light: #9ca3af;
    --danger: #dc2626;
    --danger-pale: #fef2f2;
    --success: #059669;
    --success-pale: #ecfdf5;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
    --shadow-lg: 0 12px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.06);
    --radius: 12px;
    --radius-sm: 8px;
    --radius-lg: 16px;
    --radius-xl: 24px;
  }

  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: var(--bg); color: var(--text); }

  .app { min-height: 100vh; }

  /* ── Portal Selector ──────────────────────────────────────────── */
  .portal-selector {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100vw;
    background: linear-gradient(145deg, #fff9f5 0%, #f0fafa 50%, #fffbf0 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 48px;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }
  .portal-selector::before {
    content: '';
    position: absolute;
    top: -120px; right: -120px;
    width: 400px; height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(109,203,202,0.15) 0%, transparent 70%);
  }
  .portal-selector::after {
    content: '';
    position: absolute;
    bottom: -80px; left: -80px;
    width: 300px; height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(226,93,37,0.1) 0%, transparent 70%);
  }
  .portal-logo-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    position: relative;
    z-index: 1;
  }
  .portal-logo-img {
    width: 90px;
    height: 90px;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(226,93,37,0.25));
  }
  .portal-brand-name {
    font-size: 22px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
    margin-top: 4px;
  }
  .portal-brand-name span { color: var(--orange); }
  .portal-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: var(--text-light);
    text-transform: uppercase;
    position: relative;
    z-index: 1;
  }
  .portal-cards {
    display: flex;
    gap: 24px;
    position: relative;
    z-index: 1;
    flex-wrap: wrap;
    justify-content: center;
  }
  .portal-card {
    width: 280px;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 36px 28px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    box-shadow: var(--shadow-sm);
  }
  .portal-card:hover {
    transform: translateY(-6px);
    box-shadow: var(--shadow-lg);
    border-color: var(--orange);
  }
  .portal-card.fp:hover { border-color: var(--teal-dark); }
  .portal-icon-wrap {
    width: 68px; height: 68px;
    border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    background: var(--orange-pale);
    color: var(--orange);
  }
  .portal-card.fp .portal-icon-wrap {
    background: var(--teal-pale);
    color: var(--teal-dark);
  }
  .portal-card-title {
    font-size: 19px;
    font-weight: 700;
    color: var(--text);
  }
  .portal-card-desc {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.6;
  }
  .portal-badge {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 14px;
    border-radius: 20px;
    text-transform: uppercase;
    background: var(--orange-pale);
    color: var(--orange);
    border: 1px solid var(--orange-border);
  }
  .portal-card.fp .portal-badge {
    background: var(--teal-pale);
    color: var(--teal-dark);
    border-color: var(--teal-border);
  }
  .portal-hint {
    font-size: 13px;
    color: var(--text-light);
    position: relative;
    z-index: 1;
  }

  /* ── Auth ─────────────────────────────────────────────────────── */
  .auth-page {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .auth-page.hq {
    background: linear-gradient(145deg, #fff9f5 0%, #fdf5f0 100%);
  }
  .auth-page.fp {
    background: linear-gradient(145deg, #f0fafa 0%, #eafafa 100%);
  }
  .auth-card {
    width: 100%;
    max-width: 400px;
    padding: 44px 40px;
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--border);
  }
  .auth-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
  }
  .auth-logo-icon {
    width: 40px; height: 40px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    font-weight: 800;
  }
  .auth-logo.hq .auth-logo-icon { background: var(--orange-pale); color: var(--orange); }
  .auth-logo.fp .auth-logo-icon { background: var(--teal-pale); color: var(--teal-dark); }
  .auth-logo-text {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }
  .auth-subtitle { font-size: 14px; color: var(--text-muted); margin-bottom: 32px; }
  .google-btn {
    width: 100%;
    padding: 13px;
    border-radius: var(--radius);
    border: 2px solid transparent;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s;
  }
  .google-btn.hq {
    background: var(--orange);
    color: white;
  }
  .google-btn.hq:hover { background: var(--orange-light); }
  .google-btn.fp {
    background: var(--teal-dark);
    color: white;
  }
  .google-btn.fp:hover { background: var(--teal); }
  .google-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .back-link {
    background: none; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    margin-top: 20px;
    display: block;
    text-align: center;
    color: var(--text-light);
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--text-muted); }
  .auth-error {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--danger-pale);
    color: var(--danger);
    border: 1px solid #fecaca;
  }

  /* ── Layout ───────────────────────────────────────────────────── */
  .layout {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100vw;
    display: flex;
    background: var(--bg);
  }

  /* ── Sidebar ──────────────────────────────────────────────────── */
  .sidebar {
    width: 256px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0;
    z-index: 100;
    background: var(--surface);
    border-right: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    transition: transform 0.3s ease;
  }
  .sidebar-header {
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sidebar-logo-img {
    width: 36px; height: 36px;
    object-fit: contain;
  }
  .sidebar-brand {
    display: flex;
    flex-direction: column;
  }
  .sidebar-logo {
    font-size: 15px;
    font-weight: 800;
    color: var(--text);
    line-height: 1.2;
  }
  .sidebar-logo span { color: var(--orange); }
  .sidebar-subtitle {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .sidebar.hq .sidebar-subtitle { color: var(--text-light); }
  .sidebar.fp .sidebar-subtitle { color: var(--teal-dark); }
  .sidebar-nav {
    flex: 1;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-light);
    padding: 8px 10px 4px;
    margin-top: 8px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    transition: all 0.15s;
    color: var(--text-muted);
  }
  .nav-item:hover { background: var(--bg); color: var(--text); }
  .sidebar.hq .nav-item.active {
    background: var(--orange-pale);
    color: var(--orange);
    font-weight: 600;
  }
  .sidebar.fp .nav-item.active {
    background: var(--teal-pale);
    color: var(--teal-dark);
    font-weight: 600;
  }
  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--border);
  }
  .user-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    margin-bottom: 4px;
    background: var(--bg);
  }
  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
    color: white;
  }
  .sidebar.hq .avatar { background: var(--orange); }
  .sidebar.fp .avatar { background: var(--teal-dark); }
  .user-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .user-role { font-size: 11px; color: var(--text-light); }

  /* ── Main Content ─────────────────────────────────────────────── */
  .main {
    margin-left: 256px;
    flex: 1;
    padding: 32px 36px;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg);
    overflow-x: hidden;
    max-width: calc(100vw - 256px);
  }

  /* ── Mobile header ────────────────────────────────────────────── */
  .mobile-header {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 50;
    box-shadow: var(--shadow-sm);
  }
  .mobile-header-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 800;
    color: var(--text);
  }
  .mobile-header-logo span { color: var(--orange); }
  .mobile-header-logo img { width: 28px; height: 28px; object-fit: contain; }
  .hamburger {
    width: 36px; height: 36px;
    border: none;
    background: var(--bg);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 90;
  }

  /* ── Page Header ──────────────────────────────────────────────── */
  .page-header {
    margin-bottom: 28px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .page-header-left {}
  .page-title {
    font-size: 24px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
  }
  .page-desc { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

  /* ── Stats ────────────────────────────────────────────────────── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px 22px;
    box-shadow: var(--shadow-sm);
  }
  .stat-card.hq { border-top: 3px solid var(--orange); }
  .stat-card.fp { border-top: 3px solid var(--teal); }
  .stat-num {
    font-size: 28px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -1px;
    line-height: 1;
    margin-bottom: 6px;
  }
  .stat-label { font-size: 12px; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; }

  /* ── Cards ────────────────────────────────────────────────────── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-sm);
    margin-bottom: 24px;
  }

  /* ── Buttons ──────────────────────────────────────────────────── */
  .btn {
    padding: 9px 18px;
    border-radius: var(--radius-sm);
    border: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .btn-primary.hq { background: var(--orange); color: white; }
  .btn-primary.hq:hover { background: var(--orange-light); }
  .btn-primary.fp { background: var(--teal-dark); color: white; }
  .btn-primary.fp:hover { background: var(--teal); }
  .btn-ghost.hq, .btn-ghost.fp {
    background: var(--surface);
    border: 1px solid var(--border-dark);
    color: var(--text-muted);
  }
  .btn-ghost.hq:hover, .btn-ghost.fp:hover { border-color: var(--orange); color: var(--orange); }
  .btn-danger { background: var(--danger-pale); color: var(--danger); border: 1px solid #fecaca; }
  .btn-danger:hover { background: #fee2e2; }

  /* ── Table ────────────────────────────────────────────────────── */
  .table-wrap { overflow-x: auto; border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 12px 16px;
    background: var(--bg);
    color: var(--text-light);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 14px 16px;
    font-size: 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    color: var(--text);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  .td-muted { font-size: 12px; color: var(--text-muted); }

  /* ── Actions column ───────────────────────────────────────────── */
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ── Modal ────────────────────────────────────────────────────── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
    padding: 20px;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: var(--surface);
    border-radius: var(--radius-xl);
    padding: 32px;
    width: 100%;
    max-width: 480px;
    box-shadow: var(--shadow-lg);
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-title {
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
    margin-bottom: 20px;
    letter-spacing: -0.3px;
  }
  .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 24px;
    flex-wrap: wrap;
  }

  /* ── Forms ────────────────────────────────────────────────────── */
  .form-group { margin-bottom: 18px; }
  .form-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 7px;
  }
  .form-input {
    width: 100%;
    padding: 11px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dark);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    color: var(--text);
    background: var(--surface);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .form-input:focus {
    border-color: var(--orange);
    box-shadow: 0 0 0 3px rgba(226,93,37,0.1);
  }
  .form-input.fp:focus {
    border-color: var(--teal-dark);
    box-shadow: 0 0 0 3px rgba(109,203,202,0.15);
  }
  .phone-row { display: flex; gap: 10px; }
  .phone-code { width: 130px; flex-shrink: 0; }
  .form-hint {
    font-size: 12px;
    color: var(--text-light);
    margin-top: 4px;
  }

  /* ── Confirm modal ────────────────────────────────────────────── */
  .confirm-body { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 4px; }
  .confirm-name { font-weight: 700; color: var(--text); }

  /* ── Empty state ──────────────────────────────────────────────── */
  .empty-state {
    padding: 60px 20px;
    text-align: center;
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; color: var(--text-light); }

  /* ── Toast ────────────────────────────────────────────────────── */
  .toast {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 22px;
    border-radius: 40px;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 999;
    white-space: nowrap;
    box-shadow: var(--shadow-lg);
    animation: slideUp 0.3s ease;
  }
  .toast-success {
    background: var(--success-pale);
    color: var(--success);
    border: 1px solid #a7f3d0;
  }
  @keyframes slideUp {
    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
  }

  /* ── Timetable (Partner Portal) ───────────────────────────────── */
  .timetable-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .timetable-row:last-child { border-bottom: none; }
  .day-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 120px;
    flex-shrink: 0;
  }
  .toggle {
    position: relative;
    width: 40px; height: 22px;
    border-radius: 11px;
    cursor: pointer;
    border: none;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .toggle.on { background: var(--teal-dark); }
  .toggle.off { background: var(--border-dark); }
  .toggle::after {
    content: '';
    position: absolute;
    top: 3px;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .toggle.on::after { left: 21px; }
  .toggle.off::after { left: 3px; }
  .day-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .day-off { font-size: 12px; color: var(--text-light); }
  .time-inputs { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .time-input {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dark);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    color: var(--text);
    background: var(--surface);
    outline: none;
    width: 120px;
    transition: border-color 0.2s;
  }
  .time-input:focus { border-color: var(--teal-dark); }
  .time-separator { color: var(--text-light); font-size: 13px; }

  /* ── Buffer chips ─────────────────────────────────────────────── */
  .buffer-chips { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .buffer-chip {
    padding: 8px 18px;
    border-radius: 40px;
    border: 2px solid var(--border-dark);
    background: var(--surface);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
  }
  .buffer-chip.active {
    background: var(--teal-pale);
    border-color: var(--teal-dark);
    color: var(--teal-dark);
  }
  .buffer-chip:hover:not(.active) { border-color: var(--teal); color: var(--teal-dark); }

  /* ── Info notice ──────────────────────────────────────────────── */
  .info-notice {
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .info-notice.hq {
    background: var(--orange-pale);
    border: 1px solid var(--orange-border);
    color: var(--orange);
  }
  .info-notice.fp {
    background: var(--teal-pale);
    border: 1px solid var(--teal-border);
    color: var(--teal-dark);
  }

  /* ── Section header inside card ───────────────────────────────── */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .card-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }

  /* ── Role badge ───────────────────────────────────────────────── */
  .role-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    letter-spacing: 0.04em;
    display: inline-block;
  }
  .role-badge.master { background: var(--orange-pale); color: var(--orange); border: 1px solid var(--orange-border); }
  .role-badge.admin { background: var(--bg); color: var(--text-muted); border: 1px solid var(--border-dark); }

  /* ── Responsive ───────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .sidebar-overlay.open {
      display: block;
    }
    .mobile-header {
      display: flex;
    }
    .main {
      margin-left: 0;
      padding: 20px 16px;
      max-width: 100vw;
    }
    .portal-selector {
      gap: 32px;
      padding: 24px 16px;
    }
    .portal-cards {
      flex-direction: column;
      align-items: center;
      width: 100%;
      padding: 0 8px;
    }
    .portal-card {
      width: 100%;
      max-width: 340px;
      padding: 28px 22px;
    }
    .portal-logo-img {
      width: 72px;
      height: 72px;
    }
    .portal-brand-name {
      font-size: 20px;
    }
    .portal-title {
      font-size: 11px;
    }
    .auth-page {
      padding: 16px;
    }
    .auth-card {
      padding: 32px 24px;
    }
    .stats-row {
      grid-template-columns: 1fr 1fr;
    }
    .page-header {
      flex-direction: column;
      gap: 12px;
    }
    .page-title {
      font-size: 20px;
    }
    .modal-overlay {
      padding: 12px;
      align-items: flex-start;
      padding-top: 40px;
    }
    .modal {
      padding: 24px 20px;
      max-height: 90vh;
      overflow-y: auto;
      width: 100%;
    }
    .phone-row {
      flex-direction: column;
    }
    .phone-code {
      width: 100% !important;
    }
    .timetable-row, .day-row {
      flex-wrap: wrap;
      gap: 10px;
    }
    .day-toggle { width: auto; }
    .day-name { width: 80px; font-size: 13px; }
    .time-inputs { width: 100%; }
    .time-input { width: 100%; }
    .actions { flex-direction: column; }
    .actions .btn { width: 100%; justify-content: center; }
    .settings-grid {
      grid-template-columns: 1fr;
    }
    .buffer-options {
      flex-wrap: wrap;
    }
    .save-bar {
      justify-content: stretch;
    }
    .save-bar .btn {
      width: 100%;
      justify-content: center;
    }
    .card {
      border-radius: var(--radius);
    }
    .table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .btn-primary {
      width: 100%;
      justify-content: center;
    }
    .select-styled {
      width: 100% !important;
    }
  }
  @media (max-width: 480px) {
    .portal-selector {
      gap: 24px;
      padding: 20px 12px;
    }
    .portal-card {
      padding: 24px 18px;
      gap: 12px;
    }
    .portal-icon-wrap {
      width: 56px;
      height: 56px;
    }
    .portal-card-title {
      font-size: 17px;
    }
    .portal-card-desc {
      font-size: 12px;
    }
    .stats-row { grid-template-columns: 1fr; }
    .buffer-chips { gap: 8px; }
    .buffer-chip { padding: 7px 14px; font-size: 12px; }
    .table-wrap { margin: 0 -8px; }
    .portal-logo-img { width: 64px; height: 64px; }
    .portal-brand-name { font-size: 18px; }
    .auth-card { padding: 28px 18px; }
    .page-header { padding: 0; }
    .stat-card { padding: 14px 16px; }
    .day-row { padding: 12px 0; }
  }
  @media (max-width: 360px) {
    .portal-card {
      max-width: 100%;
      padding: 20px 16px;
    }
    .auth-card {
      padding: 24px 16px;
    }
    .modal {
      padding: 20px 16px;
    }
  }
`;

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [portal, setPortal] = useState(null); // 'hq' | 'fp'
  const [session, setSession] = useState(null);

  const handleLogin = (user) => setSession(user);
  const handleLogout = () => { setSession(null); setPortal(null); };

  return (
    <>
      <style>{styles}</style>
      {!portal && <PortalSelector onSelect={setPortal} />}
      {portal && !session && (
        <AuthPage portal={portal} onLogin={handleLogin} onBack={() => setPortal(null)} />
      )}
      {portal && session && (
        portal === 'hq'
          ? <HQPortal user={session} onLogout={handleLogout} />
          : <FranchisePortal user={session} onLogout={handleLogout} />
      )}
    </>
  );
}

// ─── Portal Selector ──────────────────────────────────────────────────────────
function PortalSelector({ onSelect }) {
  return (
    <div className="portal-selector">
      <div className="portal-logo-wrap">
        <img src="/logo-sticker.png" alt="Success Tutoring" className="portal-logo-img" />
        <div className="portal-brand-name"><span>Success</span> Tutoring</div>
      </div>
      <div className="portal-title">Franchise Management System</div>
      <div className="portal-cards">
        <div className="portal-card" onClick={() => onSelect('hq')}>
          <div className="portal-icon-wrap">
            <Icon path={icons.building} size={28} />
          </div>
          <div className="portal-card-title">HQ Portal</div>
          <div className="portal-card-desc">Manage franchise locations, admins and operations from headquarters.</div>
          <div className="portal-badge">HQ Staff</div>
        </div>
        <div className="portal-card fp" onClick={() => onSelect('fp')}>
          <div className="portal-icon-wrap">
            <Icon path={icons.calendar} size={28} />
          </div>
          <div className="portal-card-title">Franchise Partner</div>
          <div className="portal-card-desc">Manage your availability, timetable and booking settings.</div>
          <div className="portal-badge">Partner Access</div>
        </div>
      </div>
      <div className="portal-hint">Click a portal to sign in</div>
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ portal, onLogin, onBack }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = portal;

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { signInWithPopup, GoogleAuthProvider, getAuth } = await import('firebase/auth');
      const { doc, getDoc } = await import('firebase/firestore');
      const firebaseModule = await import('./firebase.js');
      const auth = firebaseModule.auth;
      const db = firebaseModule.db;
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!profileSnap.exists()) {
        setError('Your account has not been set up yet. Please contact HQ.');
        await auth.signOut();
        setLoading(false);
        return;
      }
      const profile = profileSnap.data();
      if (portal === 'hq' && profile.role !== 'master_admin' && profile.role !== 'admin') {
        setError('You do not have HQ access. Please use the Franchise Partner portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }
      if (portal === 'fp' && profile.role !== 'franchise_partner') {
        setError('You do not have Franchise Partner access. Please use the HQ portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }
      onLogin({ ...profile, uid: firebaseUser.uid, name: profile.name || firebaseUser.displayName });
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else {
        setError(err.message || 'Sign-in failed. Please try again.');
      }
    }
    setLoading(false);
  };

  return (
    <div className={`auth-page ${t}`}>
      <div className={`auth-card ${t}`}>
        <div className={`auth-logo ${t}`}>
          <div className="auth-logo-icon">{portal === 'hq' ? '⬡' : '◇'}</div>
          <div className="auth-logo-text">{portal === 'hq' ? 'HQ Portal' : 'Partner Portal'}</div>
        </div>
        <div className="auth-subtitle">Sign in to your account</div>

        {error && (
          <div className={`auth-error ${t}`}>
            <Icon path={icons.alert} size={15} /> {error}
          </div>
        )}

        <button className={`google-btn ${t}`} onClick={handleGoogleSignIn} disabled={loading}>
          <Icon path={icons.google} size={16} />
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <button className={`back-link ${t}`} onClick={onBack}>
          ← Choose portal
        </button>
      </div>
    </div>
  );
}

// ─── HQ Portal ────────────────────────────────────────────────────────────────
function HQPortal({ user, onLogout }) {
  const [page, setPage] = useState('locations');
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | { type:'edit', loc } | { type:'delete', loc }
  const [toast, setToast] = useState(null);

  const isMaster = user.role === 'master_admin';
  const [hqUsers, setHqUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModal, setUserModal] = useState(null); // null | 'invite' | { type:'remove', u }

  useEffect(() => {
    const loadLocations = async () => {
      setLocationsLoading(true);
      try {
        const locs = await getLocations();
        setLocations(locs.map(l => ({
          ...l,
          createdAt: l.createdAt?.toDate ? l.createdAt.toDate().toISOString().split('T')[0] : l.createdAt || '',
        })));
      } catch (e) { console.error("Failed to load locations:", e); }
      setLocationsLoading(false);
    };
    loadLocations();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async (data, editingId) => {
    if (editingId) {
      try {
        await updateLocation(editingId, data);
        setLocations(prev => prev.map(l => l.id === editingId ? { ...l, ...data } : l));
        showToast(`✓ Location "${data.name}" updated.`);
      } catch (err) {
        console.error("Failed to update location:", err);
        showToast(`✗ Failed to update location. Please try again.`);
      }
    } else {
      try {
        const newId = await createLocation(data);
        const newLoc = { ...data, id: newId, createdAt: new Date().toISOString().split('T')[0] };
        setLocations(prev => [...prev, newLoc]);
        showToast(`✓ Location created. Confirmation email sent to ${data.email} via SendGrid.`);
      } catch (err) {
        console.error("Failed to create location:", err);
        showToast(`✗ Failed to create location. Please try again.`);
      }
    }
    setModal(null);
  };

  const handleDelete = async (id) => {
    const loc = locations.find(l => l.id === id);
    try {
      await deleteLocation(id);
      setLocations(prev => prev.filter(l => l.id !== id));
      showToast(`Location "${loc.name}" deleted.`);
    } catch (err) {
      console.error("Failed to delete location:", err);
      showToast(`✗ Failed to delete location. Please try again.`);
    }
    setModal(null);
  };

  return (
    <div className="layout hq">
      <div className="mobile-header">
        <div className="mobile-header-logo">
          <img src="/logo-sticker.png" alt="" />
          <span><span style={{color:'var(--orange)'}}>Success</span> Tutoring</span>
        </div>
        <button className="hamburger" onClick={() => document.querySelector('.sidebar.hq').classList.toggle('open')}>
          <Icon path={icons.menu} size={20} />
        </button>
      </div>
      <div className="sidebar-overlay" onClick={() => document.querySelector('.sidebar.hq').classList.remove('open')} />
      <aside className="sidebar hq">
        <div className="sidebar-header">
          <img src="/logo-sticker.png" alt="" className="sidebar-logo-img" />
          <div className="sidebar-brand">
            <div className="sidebar-logo"><span>Success</span> Tutoring</div>
            <div className="sidebar-subtitle">HQ Portal</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${page === 'locations' ? 'active' : ''}`} onClick={() => setPage('locations')}>
            <Icon path={icons.map} size={16} /> Locations
          </button>
          {isMaster && (
            <button className={`nav-item ${page === 'users' ? 'active' : ''}`} onClick={() => setPage('users')}>
              <Icon path={icons.users} size={16} /> Users
            </button>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{isMaster ? 'Master Admin' : 'Admin'}</div>
            </div>
          </div>
          <button className="nav-item" onClick={onLogout}>
            <Icon path={icons.logout} size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main hq">
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-title">{page === 'users' ? 'HQ Users' : 'Franchise Locations'}</div>
            <div className="page-desc">
              {page === 'users'
                ? 'Manage HQ staff who can add and edit locations.'
                : isMaster
                  ? 'You have full access — add, edit, and delete locations.'
                  : 'You can add and edit locations. Only master admins can delete.'}
            </div>
          </div>
          {page === 'locations' && (
            <button className="btn btn-primary hq" onClick={() => setModal('add')}>
              <Icon path={icons.plus} size={14} /> Add Location
            </button>
          )}
        </div>

        {page === 'locations' && (<>
        <div className="stats-row">
          <div className="stat-card hq">
            <div className="stat-num" style={{color:"var(--orange)"}}>{locations.length}</div>
            <div className="stat-label">Total Locations</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num" style={{ color: 'var(--success)' }}>
              {isMaster ? <span style={{ fontSize: 16 }}>Master Admin</span> : <span style={{ fontSize: 16 }}>Admin</span>}
            </div>
            <div className="stat-label">Your access level</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num">
              <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, color: 'var(--orange)' }}>
                <Icon path={icons.shield} size={20} /> 2FA Enabled
              </span>
            </div>
            <div className="stat-label">Google Authenticator</div>
          </div>
        </div>

        <div className="card hq">
          <div className="card-header">
            <span className="card-title">All Locations ({locations.length})</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="hq">Location</th>
                  <th className="hq">Address</th>
                  <th className="hq">Contact</th>
                  <th className="hq">Email</th>
                  <th className="hq">Created</th>
                  <th className="hq">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td className="hq" style={{ fontWeight: 600 }}>{loc.name}</td>
                    <td className="hq"><span className="td-muted hq">{loc.address}</span></td>
                    <td className="hq"><span className="td-muted hq">{loc.phone}</span></td>
                    <td className="hq"><span className="td-muted hq">{loc.email}</span></td>
                    <td className="hq"><span className="td-muted hq">{loc.createdAt}</span></td>
                    <td className="hq">
                      <div className="actions">
                        <button className="btn btn-ghost hq" style={{ padding: '7px 12px' }} onClick={() => setModal({ type: 'edit', loc })}>
                          <Icon path={icons.edit} size={13} /> Edit
                        </button>
                        {isMaster && (
                          <button className="btn btn-danger" style={{ padding: '7px 12px' }} onClick={() => setModal({ type: 'delete', loc })}>
                            <Icon path={icons.trash} size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {locations.length === 0 && (
            <div className="empty-state hq">
              <div className="empty-icon">{locationsLoading ? '⏳' : '🗺️'}</div>
              <div className="empty-text hq">{locationsLoading ? 'Loading locations from database...' : 'No locations yet. Add your first franchise location.'}</div>
            </div>
          )}
        </div>
        </>)}

      {/* Users Page */}
      {page === 'users' && isMaster && (
        <UsersPage
          currentUser={user}
          hqUsers={hqUsers}
          setHqUsers={setHqUsers}
          loading={usersLoading}
          setLoading={setUsersLoading}
          onInvite={() => setUserModal('invite')}
          onRemove={(u) => setUserModal({ type: 'remove', u })}
        />
      )}

      </main>

      {/* Modals */}
      {(modal === 'add' || modal?.type === 'edit') && (
        <LocationModal
          portal="hq"
          editing={modal?.type === 'edit' ? modal.loc : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmModal
          portal="hq"
          title="Delete Location"
          body={<>Are you sure you want to permanently delete <span className="confirm-name hq">{modal.loc.name}</span>? This action cannot be undone.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(modal.loc.id)}
          onClose={() => setModal(null)}
        />
      )}

      {userModal === 'invite' && (
        <InviteUserModal
          onClose={() => setUserModal(null)}
          onInvited={(newUser) => { setHqUsers(prev => [...prev, newUser]); setUserModal(null); showToast(`✓ Invite sent to ${newUser.email}`); }}
        />
      )}
      {userModal?.type === 'remove' && (
        <ConfirmModal
          portal="hq"
          title="Remove User"
          body={<>Are you sure you want to remove <span className="confirm-name hq">{userModal.u.name}</span>? They will lose all access immediately.</>}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            const { doc, deleteDoc } = await import('firebase/firestore');
            const { db } = await import('./firebase.js');
            await deleteDoc(doc(db, 'users', userModal.u.id));
            setHqUsers(prev => prev.filter(u => u.id !== userModal.u.id));
            showToast(`User ${userModal.u.name} removed.`);
            setUserModal(null);
          }}
          onClose={() => setUserModal(null)}
        />
      )}

      {toast && (
        <div className="toast hq toast-success">
          <span className="toast-icon"><Icon path={icons.check} size={16} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Location Modal ───────────────────────────────────────────────────────────
function LocationModal({ portal, editing, onSave, onClose }) {
  const [name, setName] = useState(editing?.name || '');
  const [address, setAddress] = useState(editing?.address || '');
  const [countryCode, setCountryCode] = useState(editing ? editing.phone.split(' ')[0] : '+61');
  const [phoneNum, setPhoneNum] = useState(editing ? editing.phone.split(' ').slice(1).join(' ') : '');
  const [email, setEmail] = useState(editing?.email || '');
  const t = portal;
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!addressInputRef.current || !window.google?.maps?.places) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ['address'],
      fields: ['formatted_address'],
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (place.formatted_address) {
        setAddress(place.formatted_address);
      }
    });
    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    if (!name || !address || !email) return;
    onSave({ name, address, phone: `${countryCode} ${phoneNum}`, email }, editing?.id);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${t}`}>
        <div className={`modal-title`} style={{ color: 'var(--text)' }}>
          {editing ? 'Edit Location' : 'Add New Location'}
        </div>

        {!editing && (
          <div className="info-notice hq">
            <Icon path={icons.mail} size={14} />
            A confirmation email will be sent via SendGrid when this location is created.
          </div>
        )}

        <div className="form-group">
          <label className={`form-label ${t}`}>Location Name</label>
          <input className={`form-input ${t}`} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Melbourne CBD" />
        </div>
        <div className="form-group">
          <label className={`form-label ${t}`}>Full Address</label>
          <input ref={addressInputRef} className={`form-input ${t}`} value={address} onChange={e => setAddress(e.target.value)} placeholder="Start typing an address..." />
        </div>
        <div className="form-group">
          <label className={`form-label ${t}`}>Contact Number</label>
          <div className="phone-row">
            <select className={`form-input ${t} phone-code`} value={countryCode} onChange={e => setCountryCode(e.target.value)}>
              {COUNTRY_CODES.map(c => (
                <option key={c.code} value={c.code}>{c.code} {c.country}</option>
              ))}
            </select>
            <input className={`form-input ${t}`} value={phoneNum} onChange={e => setPhoneNum(e.target.value)} placeholder="400 000 000" />
          </div>
        </div>
        <div className="form-group">
          <label className={`form-label ${t}`}>Email Address</label>
          <input className={`form-input ${t}`} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="location@franchise.com" />
        </div>

        <div className="modal-actions">
          <button className={`btn btn-ghost ${t}`} onClick={onClose}>Cancel</button>
          <button className={`btn btn-primary ${t}`} onClick={handleSave}>
            <Icon path={icons.check} size={14} />
            {editing ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ portal, title, body, confirmLabel, danger, onConfirm, onClose }) {
  const t = portal;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${t}`} style={{ maxWidth: 400 }}>
        <div className="modal-title" style={{ color: danger ? 'var(--hq-danger)' : 'inherit' }}>{title}</div>
        <div className={`confirm-body ${t}`}>{body}</div>
        <div className="modal-actions">
          <button className={`btn btn-ghost ${t}`} onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : `btn-primary ${t}`}`} onClick={onConfirm}>
            {danger && <Icon path={icons.trash} size={13} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Users Page ──────────────────────────────────────────────────────────────
function UsersPage({ currentUser, hqUsers, setHqUsers, loading, setLoading, onInvite, onRemove }) {
  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'master_admin']));
        const snap = await getDocs(q);
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHqUsers(users);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    loadUsers();
  }, []);

  return (
    <>
      <div className="card hq" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text)', fontSize: 16 }}>HQ Staff</span>
          <button className="btn btn-primary hq" onClick={onInvite}>
            <Icon path={icons.plus} size={14} /> Invite User
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading users...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="hq">Name</th>
                  <th className="hq">Email</th>
                  <th className="hq">Job Title</th>
                  <th className="hq">Role</th>
                  <th className="hq">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hqUsers.map(u => (
                  <tr key={u.id}>
                    <td className="hq" style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)', fontWeight: 700, fontSize: 13 }}>
                          {u.name?.[0] || '?'}
                        </div>
                        {u.name}
                        {u.id === currentUser.uid && <span style={{ fontSize: 10, background: 'var(--orange-pale)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 20 }}>You</span>}
                      </div>
                    </td>
                    <td className="hq"><span className="td-muted hq">{u.email}</span></td>
                    <td className="hq"><span className="td-muted hq">{u.jobTitle || '—'}</span></td>
                    <td className="hq">
                      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: u.role === 'master_admin' ? 'rgba(200,169,110,0.15)' : 'rgba(100,100,120,0.2)', color: u.role === 'master_admin' ? 'var(--hq-accent)' : 'var(--hq-muted)' }}>
                        {u.role === 'master_admin' ? 'Master Admin' : 'Admin'}
                      </span>
                    </td>
                    <td className="hq">
                      {u.id !== currentUser.uid && (
                        <button className="btn btn-danger" style={{ padding: '7px 12px' }} onClick={() => onRemove(u)}>
                          <Icon path={icons.trash} size={13} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hqUsers.length === 0 && (
              <div className="empty-state hq">
                <div className="empty-icon">👥</div>
                <div className="empty-text hq">No HQ users yet. Invite your first team member.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Invite User Modal ────────────────────────────────────────────────────────
function InviteUserModal({ onClose, onInvited }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleInvite = async () => {
    if (!name || !email) { setError('Name and email are required.'); return; }
    setSending(true);
    setError('');
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      const docRef = await addDoc(collection(db, 'invites'), {
        name,
        email,
        jobTitle,
        role: 'admin',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      onInvited({ id: docRef.id, name, email, jobTitle, role: 'admin', status: 'pending' });
    } catch (e) {
      setError('Failed to send invite. Please try again.');
    }
    setSending(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal hq">
        <div className="modal-title" style={{ color: 'var(--text)' }}>Invite HQ User</div>
        <div className="info-notice hq">
          <Icon path={icons.mail} size={14} />
          They will receive an email with a link to sign in. They will have Admin access (can add and edit locations, but not delete).
        </div>
        {error && <div className="auth-error" style={{ marginBottom: 16 }}><Icon path={icons.alert} size={14} /> {error}</div>}
        <div className="form-group">
          <label className="form-label hq">Full Name</label>
          <input className="form-input hq" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jane Smith" />
        </div>
        <div className="form-group">
          <label className="form-label hq">Email Address</label>
          <input className="form-input hq" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@successtutoring.com" />
        </div>
        <div className="form-group">
          <label className="form-label hq">Job Title</label>
          <input className="form-input hq" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Operations Manager" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost hq" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary hq" onClick={handleInvite} disabled={sending}>
            <Icon path={icons.mail} size={14} />
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Franchise Partner Portal ─────────────────────────────────────────────────
function FranchisePortal({ user, onLogout }) {
  const [page, setPage] = useState('timetable');
  const [availability, setAvailability] = useState(INITIAL_AVAILABILITY);
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [buffer, setBuffer] = useState(15);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleDay = (i) => {
    setAvailability(prev => prev.map((d, j) => j === i ? { ...d, enabled: !d.enabled } : d));
  };

  const updateTime = (i, field, val) => {
    setAvailability(prev => prev.map((d, j) => j === i ? { ...d, [field]: val } : d));
  };

  const handleSave = async () => {
    try {
      await saveAvailability(user.locationId?.toString() || user.id?.toString(), {
        schedule: availability,
        timezone,
        bufferMinutes: buffer,
      });
      showToast('✓ Availability saved successfully.');
    } catch (err) {
      console.error("Failed to save availability:", err);
      showToast('✗ Failed to save availability. Please try again.');
    }
  };

  const bufferOptions = [0, 15, 30, 45, 60];

  return (
    <div className="layout fp" style={{ background: 'var(--fp-bg)' }}>
      <aside className="sidebar fp">
        <div className="sidebar-header">
          <div className="sidebar-logo">◇ Partner</div>
          <div className="sidebar-subtitle">Franchise Portal</div>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${page === 'timetable' ? 'active' : ''}`} onClick={() => setPage('timetable')}>
            <Icon path={icons.calendar} size={16} /> Timetable
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <Icon path={icons.clock} size={16} /> Settings
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">Franchise Partner</div>
            </div>
          </div>
          <button className="nav-item" onClick={onLogout}>
            <Icon path={icons.logout} size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="main fp">
        {page === 'timetable' && (
          <>
            <div className="page-header">
              <div className="page-title" style={{ color: 'var(--fp-text)' }}>Availability Timetable</div>
              <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Set the days and hours you're available for bookings.</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div className="card fp" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <Icon path={icons.globe} size={16} style={{ color: 'var(--fp-accent)' }} />
                <span style={{ fontSize: 13, color: 'var(--fp-muted)', flex: 1 }}>Timezone</span>
                <select
                  className="select-styled fp"
                  style={{ width: 220 }}
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>

            <div className="card fp" style={{ padding: '28px' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--fp-text)', fontSize: 15, marginBottom: 20 }}>Weekly Schedule</div>
              <div className="timetable">
                {availability.map((day, i) => (
                  <div className="day-row fp" key={day.day}>
                    <div className="day-toggle">
                      <div
                        className={`toggle-track ${day.enabled ? 'on' : 'off'}`}
                        onClick={() => toggleDay(i)}
                      >
                        <div className={`toggle-thumb ${day.enabled ? 'on' : 'off'}`} />
                      </div>
                    </div>
                    <div className={`day-name fp${day.enabled ? '' : ' disabled'}`}>{day.day}</div>
                    <div className="time-inputs">
                      <input
                        type="time"
                        className="time-input fp"
                        value={day.start}
                        disabled={!day.enabled}
                        onChange={e => updateTime(i, 'start', e.target.value)}
                      />
                      <span className="time-sep fp">→</span>
                      <input
                        type="time"
                        className="time-input fp"
                        value={day.end}
                        disabled={!day.enabled}
                        onChange={e => updateTime(i, 'end', e.target.value)}
                      />
                    </div>
                    {!day.enabled && (
                      <span style={{ fontSize: 12, color: 'var(--fp-muted)', marginLeft: 'auto' }}>Unavailable</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="save-bar">
                <button className="btn btn-primary fp" onClick={handleSave}>
                  <Icon path={icons.check} size={14} /> Save Availability
                </button>
              </div>
            </div>
          </>
        )}

        {page === 'settings' && (
          <>
            <div className="page-header">
              <div className="page-title" style={{ color: 'var(--fp-text)' }}>Booking Settings</div>
              <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Configure your timezone and booking buffer preferences.</div>
            </div>

            <div className="settings-grid">
              <div className="setting-card fp">
                <div className="setting-label-row">
                  <div>
                    <div className="setting-title fp">Timezone</div>
                    <div className="setting-hint fp">Bookings will be shown in this timezone.</div>
                  </div>
                </div>
                <select className="select-styled fp" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              <div className="setting-card fp">
                <div className="setting-label-row">
                  <div>
                    <div className="setting-title fp">Booking Buffer</div>
                    <div className="setting-hint fp">Minimum gap required before a new booking.</div>
                  </div>
                </div>
                <div className="buffer-options">
                  {bufferOptions.map(b => (
                    <button
                      key={b}
                      className={`buffer-chip fp${buffer === b ? ' selected' : ''}`}
                      onClick={() => setBuffer(b)}
                    >
                      {b === 0 ? 'None' : `${b} min`}
                    </button>
                  ))}
                </div>
                <div className="setting-hint fp" style={{ marginTop: 12 }}>
                  Currently: <strong>{buffer === 0 ? 'No buffer' : `${buffer} minutes`}</strong>
                </div>
              </div>
            </div>

            <div className="save-bar" style={{ marginTop: 8 }}>
              <button className="btn btn-primary fp" onClick={async () => {
                try {
                  await saveAvailability(user.locationId?.toString() || user.id?.toString(), {
                    schedule: availability,
                    timezone,
                    bufferMinutes: buffer,
                  });
                  showToast('✓ Settings saved.');
                } catch (err) {
                  console.error("Failed to save settings:", err);
                  showToast('✗ Failed to save settings. Please try again.');
                }
              }}>
                <Icon path={icons.check} size={14} /> Save Settings
              </button>
            </div>
          </>
        )}
      </main>

      {toast && (
        <div className="toast hq toast-success" style={{ background: '#fff', border: '1px solid var(--fp-border)', color: 'var(--fp-text)' }}>
          <span className="toast-icon"><Icon path={icons.check} size={16} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}
