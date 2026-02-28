import { useState, useEffect, useRef, Fragment } from "react";
import { createLocation, updateLocation, deleteLocation, saveAvailability, getLocations, resendConfirmationEmail, resendInviteEmail, updateHqUser, logUserAction, getActivityLogs, getHqUserLogs } from "./services/firestore";

// --- Simulated Data -------------------------------------------------------------
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
  unavailable: [], // Array of { date: 'YYYY-MM-DD', reason: '' }
}));

const SERVICE_NAMES = [
  'Free Assessment', 'One-on-One Tutoring', 'Small Group Tutoring', 'Homework Club',
  'Exam Preparation', 'HSC Preparation', 'VCE Preparation', 'QCE Preparation',
  'ATAR Preparation', 'Selective School Prep', 'Scholarship Prep', 'NAPLAN Preparation',
  'Holiday Intensive', 'Reading Program', 'Writing Workshop', 'Maths Masterclass',
  'Science Lab', 'English Workshop', 'Study Skills Workshop', 'Parent Information Session', 'Other',
];

const COUNTRIES_STATES = {
  'Australia': ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania', 'Northern Territory', 'ACT'],
  'New Zealand': ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Bay of Plenty', 'Otago'],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'United States': ['California', 'New York', 'Texas', 'Florida', 'Illinois', 'Pennsylvania'],
};

// --- Date formatting helper (handles Firestore Timestamps, Date objects, and strings) ---
const formatDateValue = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val?.toDate) return val.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  if (val instanceof Date) return val.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  if (val?.seconds) return new Date(val.seconds * 1000).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  return String(val);
};

// --- Icons ----------------------------------------------------------------------
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
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
  creditCard: "M1 4h22v16H1z M1 10h22",
};

// --- Styles ---------------------------------------------------------------------
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

  /* -- Portal Selector -------------------------------------------- */
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

  /* -- Auth ------------------------------------------------------- */
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

  /* -- Layout ----------------------------------------------------- */
  .layout {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100vw;
    display: flex;
    background: var(--bg);
  }

  /* -- Sidebar ---------------------------------------------------- */
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

  /* -- Main Content ----------------------------------------------- */
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

  /* -- Mobile header ---------------------------------------------- */
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

  /* -- Page Header ------------------------------------------------ */
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

  /* -- Stats ------------------------------------------------------ */
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

  /* -- Cards ------------------------------------------------------ */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-sm);
    margin-bottom: 24px;
  }

  /* -- Buttons ---------------------------------------------------- */
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

  /* -- Table ------------------------------------------------------ */
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

  /* -- Actions column --------------------------------------------- */
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* -- Modal ------------------------------------------------------ */
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

  /* -- Forms ------------------------------------------------------ */
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

  /* -- Confirm modal ---------------------------------------------- */
  .confirm-body { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 4px; }
  .confirm-name { font-weight: 700; color: var(--text); }

  /* -- Empty state ------------------------------------------------ */
  .empty-state {
    padding: 60px 20px;
    text-align: center;
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; color: var(--text-light); }

  /* -- Toast ------------------------------------------------------ */
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

  /* -- Timetable (Partner Portal) --------------------------------- */
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

  /* -- Buffer chips ----------------------------------------------- */
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

  /* -- Info notice ------------------------------------------------ */
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

  /* -- Section header inside card --------------------------------- */
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

  /* -- Role badge ------------------------------------------------- */
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

  /* -- Responsive ------------------------------------------------- */
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

  /* --- Location Detail View --- */
  .location-detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .location-detail-header .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .location-detail-header .back-btn:hover {
    background: var(--bg);
    color: var(--text);
    border-color: var(--text-muted);
  }
  .location-detail-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border);
    margin-bottom: 24px;
  }
  .location-detail-tabs .tab-btn {
    padding: 12px 20px;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .location-detail-tabs .tab-btn:hover {
    color: var(--text);
    background: var(--bg);
  }
  .location-detail-tabs .tab-btn.active {
    color: var(--orange);
    border-bottom-color: var(--orange);
  }

  /* --- User Logs --- */
  .logs-container { display: flex; flex-direction: column; gap: 12px; }
  .log-user-card {
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    background: #fff;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .log-user-card:hover { border-color: var(--orange-border); }
  .log-user-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    cursor: pointer;
    gap: 16px;
  }
  .log-user-header:hover { background: var(--bg); }
  .log-user-info { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
  .log-user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--orange);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .log-user-details { flex: 1; min-width: 0; }
  .log-user-name { font-size: 14px; font-weight: 700; color: var(--text); }
  .log-user-email { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .log-user-meta { display: flex; gap: 16px; align-items: center; flex-shrink: 0; }
  .log-meta-item { text-align: right; }
  .log-meta-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .log-meta-value { font-size: 13px; color: var(--text); font-weight: 600; margin-top: 2px; }
  .log-summary-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    background: var(--orange-pale);
    color: var(--orange);
  }
  .log-expand-icon {
    font-size: 18px;
    color: var(--text-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .log-expand-icon.open { transform: rotate(180deg); }
  .log-detail-panel {
    border-top: 1px solid var(--border);
    padding: 0;
    max-height: 400px;
    overflow-y: auto;
  }
  .log-detail-table { width: 100%; border-collapse: collapse; }
  .log-detail-table th {
    text-align: left;
    padding: 10px 20px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
  }
  .log-detail-table td {
    padding: 10px 20px;
    font-size: 13px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
  }
  .log-detail-table tr:last-child td { border-bottom: none; }
  .log-action-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }
  .log-action-badge.sign_in { background: rgba(16,185,129,0.1); color: #059669; }
  .log-action-badge.sign_out { background: rgba(107,114,128,0.1); color: #6b7280; }
  .log-action-badge.edit { background: rgba(59,130,246,0.1); color: #3b82f6; }
  .log-action-badge.create { background: rgba(139,92,246,0.1); color: #8b5cf6; }
  .log-action-badge.delete { background: rgba(239,68,68,0.1); color: #dc2626; }
  .log-action-badge.update { background: rgba(217,119,6,0.1); color: #d97706; }
  .log-action-badge.view { background: rgba(107,114,128,0.1); color: #6b7280; }
  .log-action-badge.default { background: var(--bg); color: var(--text-muted); }
  .log-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted);
  }
  .log-empty-icon { font-size: 40px; margin-bottom: 12px; }
  .log-empty-text { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
  .log-empty-desc { font-size: 14px; color: var(--text-muted); }
  .log-filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
`;

// --- App ------------------------------------------------------------------------
export default function App() {
  const [portal, setPortal] = useState(null); // 'hq' | 'fp'
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // true while checking persisted auth

  // Restore session on page refresh via Firebase onAuthStateChanged
  // We persist the chosen portal in localStorage so refresh keeps the user on the same portal.
  // On logout we clear both the Firebase session and localStorage, so the selector starts fresh.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { onAuthStateChanged } = await import('firebase/auth');
      const { doc, getDoc } = await import('firebase/firestore');
      const { auth, db } = await import('./firebase.js');

      const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (cancelled) return;
        if (firebaseUser) {
          const savedPortal = localStorage.getItem('franchise_portal_choice');
          if (!savedPortal) {
            // No portal saved — user logged out or hasn't chosen yet.
            // Just show the portal selector; don't restore the session.
            if (!cancelled) setAuthLoading(false);
            return;
          }
          try {
            const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (profileSnap.exists()) {
              const profile = profileSnap.data();
              const restoredSession = { ...profile, uid: firebaseUser.uid, name: profile.name || firebaseUser.displayName };
              // Validate that the user's role matches the saved portal choice
              const isHqRole = profile.role === 'master_admin' || profile.role === 'admin';
              const isFpRole = profile.role === 'franchise_partner';
              if (savedPortal === 'hq' && isHqRole) {
                setPortal('hq');
                setSession(restoredSession);
              } else if (savedPortal === 'fp' && isFpRole) {
                setPortal('fp');
                setSession(restoredSession);
              } else {
                // Role/portal mismatch — clear and let user re-pick
                localStorage.removeItem('franchise_portal_choice');
              }
            } else {
              // No profile found — clear saved choice
              localStorage.removeItem('franchise_portal_choice');
            }
          } catch (err) {
            console.error('Failed to restore session:', err);
            localStorage.removeItem('franchise_portal_choice');
          }
        }
        if (!cancelled) setAuthLoading(false);
      });

      return unsub;
    };

    let unsub;
    init().then(u => { unsub = u; });
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const handleLogin = (user) => setSession(user);
  const handleLogout = async () => {
    try {
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('./firebase.js');
      localStorage.removeItem('franchise_portal_choice');
      localStorage.removeItem('hq_portal_page');
      localStorage.removeItem('fp_portal_page');
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setSession(null);
    setPortal(null);
  };

  // Show a brief loading state while checking for persisted auth
  if (authLoading) {
    return (
      <>
        <style>{styles}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#888' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/logo-sticker.png" alt="Success Tutoring" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 16, opacity: 0.7 }} />
            <div style={{ fontSize: 14 }}>Loading...</div>
          </div>
        </div>
      </>
    );
  }

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

// --- Portal Selector ------------------------------------------------------------
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

// --- Auth Page ------------------------------------------------------------------
function AuthPage({ portal, onLogin, onBack }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = portal;

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const { signInWithPopup, signOut, GoogleAuthProvider, getAuth } = await import('firebase/auth');
      const { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } = await import('firebase/firestore');
      const firebaseModule = await import('./firebase.js');
      const auth = firebaseModule.auth;
      const db = firebaseModule.db;

      // Sign out any stale session first to ensure a clean Google sign-in
      if (auth.currentUser) {
        await signOut(auth);
      }

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));

      if (!profileSnap.exists()) {
        // Check if this user's email matches any location (franchise partner auto-registration)
        if (portal === 'fp') {
          const locQuery = query(collection(db, 'locations'), where('email', '==', firebaseUser.email));
          const locSnap = await getDocs(locQuery);

          if (!locSnap.empty) {
            const matchedLoc = locSnap.docs[0];
            // Auto-create franchise partner profile
            const partnerProfile = {
              name: firebaseUser.displayName || matchedLoc.data().name,
              email: firebaseUser.email,
              role: 'franchise_partner',
              locationId: matchedLoc.id,
              updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), partnerProfile);
            // Log sign-in
            logUserAction({
              locationId: matchedLoc.id,
              userId: firebaseUser.uid,
              userName: partnerProfile.name,
              userEmail: firebaseUser.email,
              action: 'sign_in',
              category: 'auth',
              details: 'First sign-in (auto-registered as franchise partner)',
            });
            localStorage.setItem('franchise_portal_choice', portal);
            onLogin({ ...partnerProfile, uid: firebaseUser.uid });
            setLoading(false);
            return;
          }
        }

        // Check if this user's email matches a pending HQ invite (HQ auto-registration)
        if (portal === 'hq') {
          const inviteQuery = query(collection(db, 'invites'), where('email', '==', firebaseUser.email), where('status', '==', 'pending'));
          const inviteSnap = await getDocs(inviteQuery);

          if (!inviteSnap.empty) {
            const invite = inviteSnap.docs[0].data();
            const inviteId = inviteSnap.docs[0].id;
            // Auto-create HQ user profile from the invite
            const hqProfile = {
              name: invite.name || firebaseUser.displayName || '',
              email: firebaseUser.email,
              role: invite.role || 'admin',
              jobTitle: invite.jobTitle || '',
              updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), hqProfile);
            // Mark invite as accepted
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'invites', inviteId), { status: 'accepted', acceptedAt: serverTimestamp(), uid: firebaseUser.uid });
            localStorage.setItem('franchise_portal_choice', portal);
            onLogin({ ...hqProfile, uid: firebaseUser.uid });
            setLoading(false);
            return;
          }
        }

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
        // Allow HQ users (admin/master_admin) to access the FP portal if their email matches a location
        if (profile.role === 'master_admin' || profile.role === 'admin') {
          const locQuery = query(collection(db, 'locations'), where('email', '==', firebaseUser.email));
          const locSnap = await getDocs(locQuery);
          if (!locSnap.empty) {
            const matchedLoc = locSnap.docs[0];
            const fpProfile = {
              ...profile,
              role: 'franchise_partner',
              locationId: matchedLoc.id,
              _hqRole: profile.role, // preserve original HQ role
            };
            onLogin({ ...fpProfile, uid: firebaseUser.uid, name: profile.name || firebaseUser.displayName });
            localStorage.setItem('franchise_portal_choice', portal);
            logUserAction({
              locationId: matchedLoc.id,
              userId: firebaseUser.uid,
              userName: profile.name || firebaseUser.displayName,
              userEmail: firebaseUser.email || profile.email,
              action: 'sign_in',
              category: 'auth',
              details: 'HQ user signed in to franchise portal (dual-access)',
            });
            setLoading(false);
            return;
          }
        }
        setError('You do not have Franchise Partner access. Please use the HQ portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }
      onLogin({ ...profile, uid: firebaseUser.uid, name: profile.name || firebaseUser.displayName });
      localStorage.setItem('franchise_portal_choice', portal);
      // Log sign-in for franchise partners
      if (profile.role === 'franchise_partner' && profile.locationId) {
        logUserAction({
          locationId: profile.locationId,
          userId: firebaseUser.uid,
          userName: profile.name || firebaseUser.displayName,
          userEmail: firebaseUser.email || profile.email,
          action: 'sign_in',
          category: 'auth',
          details: 'Signed in to franchise portal',
        });
      }
      // Log sign-in for HQ users (log against a generic "hq" location marker)
      if (profile.role === 'master_admin' || profile.role === 'admin') {
        logUserAction({
          locationId: 'hq',
          userId: firebaseUser.uid,
          userName: profile.name || firebaseUser.displayName,
          userEmail: firebaseUser.email || profile.email,
          action: 'sign_in',
          category: 'auth',
          details: `Signed in to HQ portal as ${profile.role}`,
        });
      }
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
          <div className="auth-logo-icon"><img src="/logo-sticker.png" alt="Success Tutoring" style={{ width: 32, height: 32, objectFit: 'contain' }} /></div>
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

// --- HQ Portal ------------------------------------------------------------------
function HQPortal({ user, onLogout }) {
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem('hq_portal_page');
    return saved && ['locations', 'users', 'services', 'settings'].includes(saved) ? saved : 'locations';
  });

  // Persist page choice
  const setPagePersist = (p) => {
    setPage(p);
    localStorage.setItem('hq_portal_page', p);
  };
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | { type:'edit', loc } | { type:'delete', loc }
  const [toast, setToast] = useState(null);
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Location detail view state
  const [selectedLocation, setSelectedLocation] = useState(null); // null or location object
  const [locationTab, setLocationTab] = useState('details'); // 'details' | 'user_logs'

  const isMaster = user.role === 'master_admin';
  const [hqUsers, setHqUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModal, setUserModal] = useState(null); // null | 'invite' | { type:'remove', u } | { type:'edit', u }

  // HQ User detail view state
  const [selectedUser, setSelectedUser] = useState(null); // null or user object
  const [userDetailTab, setUserDetailTab] = useState('details'); // 'details' | 'user_logs'

  // HQ Settings
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Services
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceModal, setServiceModal] = useState(null);
  const [svcFilterCountry, setSvcFilterCountry] = useState('all');
  const [svcFilterState, setSvcFilterState] = useState('all');

  // Load HQ settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDoc(doc(db, 'settings', 'hq'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.youtubeUrl) setYoutubeUrl(data.youtubeUrl);
        }
      } catch (e) { console.error("Failed to load settings:", e); }
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSettingsLoading(true);
    try {
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      await setDoc(doc(db, 'settings', 'hq'), {
        youtubeUrl,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast('✓ Settings saved.');
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast('✗ Failed to save settings.');
    }
    setSettingsLoading(false);
  };

  // Load services
  useEffect(() => {
    const loadServices = async () => {
      setServicesLoading(true);
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDocs(collection(db, 'services'));
        setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Failed to load services:", e); }
      setServicesLoading(false);
    };
    loadServices();
  }, []);

  const handleSaveService = async (data, editingId) => {
    try {
      const { doc, setDoc, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      if (editingId) {
        await setDoc(doc(db, 'services', editingId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
        setServices(prev => prev.map(s => s.id === editingId ? { ...s, ...data } : s));
        showToast('✓ Service updated.');
      } else {
        const ref = await addDoc(collection(db, 'services'), { ...data, createdAt: serverTimestamp() });
        setServices(prev => [...prev, { id: ref.id, ...data }]);
        showToast('✓ Service created.');
      }
    } catch (err) {
      console.error("Failed to save service:", err);
      showToast('✗ Failed to save service.');
    }
    setServiceModal(null);
  };

  const handleDeleteService = async (id) => {
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      await deleteDoc(doc(db, 'services', id));
      setServices(prev => prev.filter(s => s.id !== id));
      showToast('✓ Service deleted.');
    } catch (err) {
      console.error("Failed to delete service:", err);
      showToast('✗ Failed to delete service.');
    }
    setServiceModal(null);
  };

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

  const handleSave = async (data, editingId, resendEmail) => {
    if (editingId) {
      try {
        await updateLocation(editingId, data);
        setLocations(prev => prev.map(l => l.id === editingId ? { ...l, ...data } : l));
        // Update selectedLocation if it's the one being edited
        if (selectedLocation?.id === editingId) {
          setSelectedLocation(prev => ({ ...prev, ...data }));
        }
        // Log the edit action
        logUserAction({
          locationId: editingId,
          userId: user.uid || user.id?.toString(),
          userName: user.name,
          userEmail: user.email,
          action: 'edit',
          category: 'location',
          details: `Updated location "${data.name}"`,
        });
        if (resendEmail) {
          showToast(`✓ Location "${data.name}" updated & confirmation email re-sent to ${data.email}.`);
        } else {
          showToast(`✓ Location "${data.name}" updated.`);
        }
      } catch (err) {
        console.error("Failed to update location:", err);
        showToast(`✗ Failed to update location. Please try again.`);
      }
    } else {
      try {
        const newId = await createLocation(data);
        const newLoc = { ...data, id: newId, createdAt: new Date().toISOString().split('T')[0] };
        setLocations(prev => [...prev, newLoc]);
        // Log the create action
        logUserAction({
          locationId: newId,
          userId: user.uid || user.id?.toString(),
          userName: user.name,
          userEmail: user.email,
          action: 'create',
          category: 'location',
          details: `Created location "${data.name}"`,
        });
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
      // Close detail view if deleting the currently viewed location
      if (selectedLocation?.id === id) setSelectedLocation(null);
      // Log the delete action
      logUserAction({
        locationId: id,
        userId: user.uid || user.id?.toString(),
        userName: user.name,
        userEmail: user.email,
        action: 'delete',
        category: 'location',
        details: `Deleted location "${loc.name}"`,
      });
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
          <button className={`nav-item ${page === 'locations' ? 'active' : ''}`} onClick={() => { setPagePersist('locations'); setSelectedLocation(null); }}>
            <Icon path={icons.map} size={16} /> Locations
          </button>
          {isMaster && (
            <button className={`nav-item ${page === 'users' ? 'active' : ''}`} onClick={() => { setPagePersist('users'); setSelectedUser(null); }}>
              <Icon path={icons.users} size={16} /> Users
            </button>
          )}
          <div className="nav-section-label">Configuration</div>
          <button className={`nav-item ${page === 'services' ? 'active' : ''}`} onClick={() => setPagePersist('services')}>
            <Icon path={icons.star} size={16} /> Services
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPagePersist('settings')}>
            <Icon path={icons.clock} size={16} /> Settings
          </button>
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
        {(page === 'locations' || page === 'users') && !selectedLocation && !selectedUser && (
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
        )}

        {page === 'locations' && !selectedLocation && (<>
        <div className="stats-row">
          <div className="stat-card hq">
            <div className="stat-num" style={{color:"var(--orange)"}}>{locations.length}</div>
            <div className="stat-label">Total Locations</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num" style={{ color: 'var(--success)' }}>
              {locations.filter(l => (l.status || 'open') === 'open').length}
            </div>
            <div className="stat-label">Open</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num" style={{ color: '#d97706' }}>
              {locations.filter(l => l.status === 'coming_soon').length}
            </div>
            <div className="stat-label">Coming Soon</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num" style={{ color: '#7c3aed' }}>
              {locations.filter(l => l.status === 'vip_list').length}
            </div>
            <div className="stat-label">VIP List</div>
          </div>
          <div className="stat-card hq">
            <div className="stat-num" style={{ color: '#dc2626' }}>
              {locations.filter(l => l.status === 'temporary_closed').length}
            </div>
            <div className="stat-label">Temporarily Closed</div>
          </div>
        </div>

        {/* Filter Bar */}
        {(() => {
          // Extract unique countries and states from addresses
          const countries = [...new Set(locations.map(l => {
            const parts = l.address?.split(',').map(s => s.trim()) || [];
            return parts[parts.length - 1] || 'Unknown';
          }))].sort();
          const states = [...new Set(locations.map(l => {
            const parts = l.address?.split(',').map(s => s.trim()) || [];
            if (parts.length >= 2) {
              const statePart = parts[parts.length - 2];
              const match = statePart.match(/([A-Z]{2,3})\s*\d{4}/);
              return match ? match[1] : statePart;
            }
            return 'Unknown';
          }))].sort();

          return (
            <div className="card hq" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Filters:</span>
              <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={{
                padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
              }}>
                <option value="all">All Countries</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterState} onChange={e => setFilterState(e.target.value)} style={{
                padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
              }}>
                <option value="all">All States</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
              }}>
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="coming_soon">Coming Soon</option>
                <option value="vip_list">VIP List</option>
                <option value="temporary_closed">Temporary Closed</option>
              </select>
              {(filterCountry !== 'all' || filterState !== 'all' || filterStatus !== 'all') && (
                <button onClick={() => { setFilterCountry('all'); setFilterState('all'); setFilterStatus('all'); }} style={{
                  padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--orange-pale)',
                  color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Clear Filters
                </button>
              )}
            </div>
          );
        })()}

        {(() => {
          // Apply filters
          let filtered = locations;
          if (filterStatus !== 'all') {
            filtered = filtered.filter(l => (l.status || 'open') === filterStatus);
          }
          if (filterCountry !== 'all') {
            filtered = filtered.filter(l => {
              const parts = l.address?.split(',').map(s => s.trim()) || [];
              return parts[parts.length - 1] === filterCountry;
            });
          }
          if (filterState !== 'all') {
            filtered = filtered.filter(l => {
              const parts = l.address?.split(',').map(s => s.trim()) || [];
              if (parts.length >= 2) {
                const statePart = parts[parts.length - 2];
                const match = statePart.match(/([A-Z]{2,3})\s*\d{4}/);
                const state = match ? match[1] : statePart;
                return state === filterState;
              }
              return false;
            });
          }

          const statusBadge = (s) => {
            const cfg = {
              open: { label: 'Open', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: 'rgba(16,185,129,0.2)' },
              coming_soon: { label: 'Coming Soon', bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.2)' },
              vip_list: { label: 'VIP List', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
              temporary_closed: { label: 'Temp. Closed', bg: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'rgba(239,68,68,0.2)' },
            };
            const c = cfg[s] || cfg.open;
            return (
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                {c.label}
              </span>
            );
          };

          return (
            <div className="card hq">
              <div className="card-header">
                <span className="card-title">
                  {filterCountry !== 'all' || filterState !== 'all' || filterStatus !== 'all'
                    ? `Filtered Locations (${filtered.length} of ${locations.length})`
                    : `All Locations (${locations.length})`
                  }
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="hq">Location</th>
                      <th className="hq">Address</th>
                      <th className="hq">Contact</th>
                      <th className="hq">Email</th>
                      <th className="hq">Status</th>
                      <th className="hq">Created</th>
                      <th className="hq">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(loc => (
                      <tr key={loc.id}>
                        <td className="hq" style={{ fontWeight: 600 }}>{loc.name}</td>
                        <td className="hq"><span className="td-muted hq">{loc.address}</span></td>
                        <td className="hq"><span className="td-muted hq">{loc.phone}</span></td>
                        <td className="hq"><span className="td-muted hq">{loc.email}</span></td>
                        <td className="hq">{statusBadge(loc.status || 'open')}</td>
                        <td className="hq"><span className="td-muted hq">{formatDateValue(loc.createdAt)}</span></td>
                        <td className="hq">
                          <div className="actions">
                            <button className="btn btn-ghost hq" style={{ padding: '7px 12px' }} onClick={() => { setSelectedLocation(loc); setLocationTab('details'); }}>
                              <Icon path={icons.building} size={13} /> View
                            </button>
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
              {filtered.length === 0 && (
                <div className="empty-state hq">
                  <div className="empty-icon">{locationsLoading ? '⏳' : '🗺️'}</div>
                  <div className="empty-text hq">{locationsLoading ? 'Loading locations from database...' : (filterCountry !== 'all' || filterState !== 'all' || filterStatus !== 'all') ? 'No locations match your filters.' : 'No locations yet. Add your first franchise location.'}</div>
                </div>
              )}
            </div>
          );
        })()}
        </>)}

        {/* Location Detail View */}
        {page === 'locations' && selectedLocation && (
          <LocationDetailView
            location={selectedLocation}
            locations={locations}
            user={user}
            isMaster={isMaster}
            onBack={() => setSelectedLocation(null)}
            locationTab={locationTab}
            setLocationTab={setLocationTab}
            onEdit={(loc) => setModal({ type: 'edit', loc })}
            onDelete={(loc) => setModal({ type: 'delete', loc })}
            showToast={showToast}
          />
        )}

      {/* Users Page */}
      {page === 'users' && isMaster && !selectedUser && (
        <UsersPage
          currentUser={user}
          hqUsers={hqUsers}
          setHqUsers={setHqUsers}
          loading={usersLoading}
          setLoading={setUsersLoading}
          onInvite={() => setUserModal('invite')}
          onRemove={(u) => setUserModal({ type: 'remove', u })}
          onSelectUser={(u) => { setSelectedUser(u); setUserDetailTab('details'); }}
          onEdit={(u) => setUserModal({ type: 'edit', u })}
          onResendInvite={async (u) => {
            try {
              await resendInviteEmail(u.inviteId);
              showToast(`✓ Invite email re-sent to ${u.name}.`);
            } catch (err) {
              console.error('Failed to resend invite:', err);
              showToast(`✗ Failed to resend invite email.`);
            }
          }}
          onDeleteInvite={(u) => setUserModal({ type: 'delete_invite', u })}
        />
      )}

      {/* User Detail View */}
      {page === 'users' && isMaster && selectedUser && (
        <HqUserDetailView
          hqUser={selectedUser}
          currentUser={user}
          onBack={() => setSelectedUser(null)}
          userDetailTab={userDetailTab}
          setUserDetailTab={setUserDetailTab}
          onEdit={(u) => setUserModal({ type: 'edit', u })}
          onRemove={(u) => setUserModal({ type: 'remove', u })}
          showToast={showToast}
        />
      )}

      {/* Services Page */}
      {page === 'services' && (
        <>
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-title">Services</div>
              <div className="page-desc">Create and manage the services offered across your franchise network.</div>
            </div>
            {isMaster && (
              <button className="btn btn-primary hq" onClick={() => setServiceModal('add')}>
                <Icon path={icons.plus} size={14} /> Add Service
              </button>
            )}
          </div>

          {/* Filters */}
          {services.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Filters:</span>
              <select value={svcFilterCountry} onChange={e => { setSvcFilterCountry(e.target.value); setSvcFilterState('all'); }} style={{
                padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
              }}>
                <option value="all">All Countries</option>
                {Object.keys(COUNTRIES_STATES).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {svcFilterCountry !== 'all' && (
                <select value={svcFilterState} onChange={e => setSvcFilterState(e.target.value)} style={{
                  padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
                }}>
                  <option value="all">All States</option>
                  {(COUNTRIES_STATES[svcFilterCountry] || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {(svcFilterCountry !== 'all' || svcFilterState !== 'all') && (
                <button onClick={() => { setSvcFilterCountry('all'); setSvcFilterState('all'); }} style={{
                  padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--orange-pale)',
                  color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>Clear Filters</button>
              )}
            </div>
          )}

          {servicesLoading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Loading services...</div>
          ) : services.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4CB;</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No services yet</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Create your first service to get started.</div>
              {isMaster && (
                <button className="btn btn-primary hq" onClick={() => setServiceModal('add')}>
                  <Icon path={icons.plus} size={14} /> Add Service
                </button>
              )}
            </div>
          ) : (() => {
            let filtered = services;
            if (svcFilterCountry !== 'all') {
              filtered = filtered.filter(s => s.countries?.includes(svcFilterCountry));
            }
            if (svcFilterState !== 'all') {
              filtered = filtered.filter(s => s.availability?.includes(svcFilterState));
            }
            return filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                No services match the selected filters.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {filtered.map(svc => (
                <div key={svc.id} className="card hq" style={{ padding: 0, overflow: 'hidden' }}>
                  {svc.imageUrl ? (
                    <div style={{ height: 160, background: `url(${svc.imageUrl}) center/cover no-repeat`, borderBottom: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ height: 160, background: 'linear-gradient(135deg, var(--orange-pale), #fff5ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                      <Icon path={icons.star} size={40} style={{ color: 'var(--orange)', opacity: 0.3 }} />
                    </div>
                  )}
                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{svc.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{svc.description}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                      <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--orange-pale)', color: 'var(--orange)', fontSize: 12, fontWeight: 700 }}>{svc.duration} min</span>
                      <span style={{ padding: '4px 10px', borderRadius: 6, background: '#eef6ff', color: '#3b82f6', fontSize: 12, fontWeight: 700 }}>Max {svc.maxStudents} students</span>
                      {svc.price && <span style={{ padding: '4px 10px', borderRadius: 6, background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 700 }}>${svc.price} RRP</span>}
                    </div>
                    {svc.availability && svc.availability.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                        {svc.availability.map((a, i) => (
                          <span key={i} style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{a}</span>
                        ))}
                      </div>
                    )}
                    {isMaster && (
                      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <button className="btn btn-ghost hq" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setServiceModal({ type: 'edit', svc })}>
                          <Icon path={icons.edit} size={13} /> Edit
                        </button>
                        <button className="btn btn-ghost hq" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--hq-danger)' }} onClick={() => setServiceModal({ type: 'delete', svc })}>
                          <Icon path={icons.trash} size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            );
          })()}
        </>
      )}

      {/* Settings Page */}
      {page === 'settings' && (
        <>
          <div className="page-header">
            <div className="page-header-left">
              <div className="page-title">Settings</div>
              <div className="page-desc">Configure booking page and portal-wide settings.</div>
            </div>
          </div>
          <div className="settings-grid">
            <div className="setting-card hq" style={{ gridColumn: '1 / -1' }}>
              <div className="setting-label-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>Confirmation Page Video</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>YouTube video shown to customers after they book an assessment. Paste the full YouTube URL.</div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <input
                  className="form-input hq"
                  style={{ width: '100%' }}
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
              {youtubeUrl && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  Preview: <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)' }}>{youtubeUrl}</a>
                </div>
              )}
            </div>
          </div>
          <div className="save-bar" style={{ marginTop: 16 }}>
            <button className="btn btn-primary hq" onClick={handleSaveSettings} disabled={settingsLoading}>
              <Icon path={icons.check} size={14} /> {settingsLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </>
      )}

      </main>

      {/* Modals */}
      {(modal === 'add' || modal?.type === 'edit') && (
        <LocationModal
          portal="hq"
          editing={modal?.type === 'edit' ? modal.loc : null}
          locations={locations}
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
          onInvited={(newUser) => { setHqUsers(prev => [...prev, { ...newUser, _isPendingInvite: true }]); setUserModal(null); showToast(`✓ Invite sent to ${newUser.email}`); }}
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
            if (selectedUser?.id === userModal.u.id) setSelectedUser(null);
            showToast(`User ${userModal.u.name} removed.`);
            setUserModal(null);
          }}
          onClose={() => setUserModal(null)}
        />
      )}
      {userModal?.type === 'edit' && (
        <EditHqUserModal
          hqUser={userModal.u}
          currentUser={user}
          onClose={() => setUserModal(null)}
          onSaved={(updatedUser) => {
            setHqUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
            if (selectedUser?.id === updatedUser.id) setSelectedUser(prev => ({ ...prev, ...updatedUser }));
            setUserModal(null);
            showToast(`✓ User "${updatedUser.name}" updated.`);
          }}
        />
      )}
      {userModal?.type === 'delete_invite' && (
        <ConfirmModal
          portal="hq"
          title="Delete Invite"
          body={<>Are you sure you want to delete the pending invite for <span className="confirm-name hq">{userModal.u.name}</span>? They will no longer be able to accept this invitation.</>}
          confirmLabel="Delete Invite"
          danger
          onConfirm={async () => {
            try {
              const { doc, deleteDoc } = await import('firebase/firestore');
              const { db } = await import('./firebase.js');
              await deleteDoc(doc(db, 'invites', userModal.u.inviteId));
              setHqUsers(prev => prev.filter(u => u.id !== userModal.u.id));
              showToast(`Invite for ${userModal.u.name} deleted.`);
              setUserModal(null);
            } catch (err) {
              console.error('Failed to delete invite:', err);
              showToast(`Failed to delete invite. Please try again.`);
            }
          }}
          onClose={() => setUserModal(null)}
        />
      )}

      {/* Service Modals */}
      {(serviceModal === 'add' || serviceModal?.type === 'edit') && (
        <ServiceModal
          editing={serviceModal?.type === 'edit' ? serviceModal.svc : null}
          onSave={handleSaveService}
          onClose={() => setServiceModal(null)}
        />
      )}
      {serviceModal?.type === 'delete' && (
        <ConfirmModal
          portal="hq"
          title="Delete Service"
          body={<>Are you sure you want to permanently delete <span className="confirm-name hq">{serviceModal.svc.name}</span>? This action cannot be undone.</>}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteService(serviceModal.svc.id)}
          onClose={() => setServiceModal(null)}
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

// --- Service Modal --------------------------------------------------------------
function ServiceModal({ editing, onSave, onClose }) {
  const [name, setName] = useState(editing?.name || '');
  const [customName, setCustomName] = useState(editing?.customName || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [duration, setDuration] = useState(editing?.duration || 40);
  const [maxStudents, setMaxStudents] = useState(editing?.maxStudents || 1);
  const [price, setPrice] = useState(editing?.price || '');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl || '');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(editing?.imageUrl || '');
  const [selectedCountries, setSelectedCountries] = useState(editing?.countries || []);
  const [selectedStates, setSelectedStates] = useState(editing?.availability || []);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const toggleCountry = (country) => {
    setSelectedCountries(prev => {
      if (prev.includes(country)) {
        const newCountries = prev.filter(c => c !== country);
        // Remove states for this country
        const countryStates = COUNTRIES_STATES[country] || [];
        setSelectedStates(s => s.filter(st => !countryStates.includes(st)));
        return newCountries;
      }
      return [...prev, country];
    });
  };

  const toggleState = (state) => {
    setSelectedStates(prev => prev.includes(state) ? prev.filter(s => s !== state) : [...prev, state]);
  };

  const handleSave = async () => {
    if (!name.trim() || !description) return;
    setSaving(true);

    let finalImageUrl = imageUrl;
    // If a file was selected, convert to base64 data URL (for simplicity without Storage)
    if (imageFile) {
      finalImageUrl = imagePreview; // base64
    }

    await onSave({
      name: name.trim(),
      description,
      duration: Number(duration),
      maxStudents: Number(maxStudents),
      price: price ? Number(price) : null,
      imageUrl: finalImageUrl,
      countries: selectedCountries,
      availability: selectedStates,
    }, editing?.id);
    setSaving(false);
  };

  const durationOptions = [20, 30, 40, 45, 60, 90, 120];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal hq" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-title" style={{ color: 'var(--text)' }}>
          {editing ? 'Edit Service' : 'Add New Service'}
        </div>

        {/* Service Name */}
        <div className="form-group">
          <div className="form-label hq">Service Name</div>
          <input
            className="form-input hq"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter service name..."
          />
        </div>

        {/* Description */}
        <div className="form-group">
          <div className="form-label hq">Description</div>
          <textarea
            className="form-input hq"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe this service..."
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* Duration & Max Students */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <div className="form-label hq">Duration</div>
            <select
              className="form-input hq"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              style={{
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px',
                paddingRight: 36, cursor: 'pointer',
              }}
            >
              {durationOptions.map(d => <option key={d} value={d}>{d} minutes</option>)}
            </select>
          </div>
          <div className="form-group">
            <div className="form-label hq">Max Students</div>
            <input
              className="form-input hq"
              type="number"
              min={1}
              max={100}
              value={maxStudents}
              onChange={e => setMaxStudents(e.target.value)}
            />
          </div>
        </div>

        {/* Price */}
        <div className="form-group">
          <div className="form-label hq">Recommended Retail Price (optional)</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 14 }}>$</span>
            <input
              className="form-input hq"
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="0.00"
              style={{ paddingLeft: 30 }}
            />
          </div>
        </div>

        {/* Image Upload */}
        <div className="form-group">
          <div className="form-label hq">Service Image (optional)</div>
          {imagePreview ? (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <img src={imagePreview} alt="Preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
              <button onClick={() => { setImagePreview(''); setImageUrl(''); setImageFile(null); }} style={{
                position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: 28, borderRadius: 10, border: '2px dashed var(--border)', textAlign: 'center',
                cursor: 'pointer', background: 'var(--bg)', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--orange)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Click to upload an image</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>JPG, PNG up to 5MB</div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
        </div>

        {/* Countries & States */}
        <div className="form-group">
          <div className="form-label hq">Available In</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Select which countries and states this service is available in.</div>
          {Object.keys(COUNTRIES_STATES).map(country => (
            <div key={country} style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedCountries.includes(country)}
                  onChange={() => toggleCountry(country)}
                  style={{ width: 16, height: 16, accentColor: 'var(--orange)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{country}</span>
              </label>
              {selectedCountries.includes(country) && (
                <div style={{ marginLeft: 24, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COUNTRIES_STATES[country].map(state => (
                    <button
                      key={state}
                      onClick={() => toggleState(state)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid',
                        borderColor: selectedStates.includes(state) ? 'var(--orange)' : 'var(--border)',
                        background: selectedStates.includes(state) ? 'var(--orange-pale)' : '#fff',
                        color: selectedStates.includes(state) ? 'var(--orange)' : 'var(--text-muted)',
                        transition: 'all 0.15s', fontFamily: 'inherit',
                      }}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost hq" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary hq" onClick={handleSave} disabled={saving || (!name || (name === 'Other' && !customName) || !description)}>
            <Icon path={icons.check} size={14} />
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Service'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Location Modal -------------------------------------------------------------
// --- Location Detail View --------------------------------------------------------
function LocationDetailView({ location, locations, user, isMaster, onBack, locationTab, setLocationTab, onEdit, onDelete, showToast }) {
  const statusBadge = (s) => {
    const cfg = {
      open: { label: 'Open', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: 'rgba(16,185,129,0.2)' },
      coming_soon: { label: 'Coming Soon', bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.2)' },
      vip_list: { label: 'VIP List', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
      temporary_closed: { label: 'Temp. Closed', bg: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'rgba(239,68,68,0.2)' },
    };
    const c = cfg[s] || cfg.open;
    return (
      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
        {c.label}
      </span>
    );
  };

  return (
    <>
      {/* Header with back button */}
      <div className="location-detail-header">
        <button className="back-btn" onClick={onBack}>
          <span style={{ fontSize: 16 }}>←</span> Back to Locations
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{location.name}</div>
            {statusBadge(location.status || 'open')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{location.address}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost hq" style={{ padding: '8px 14px' }} onClick={() => onEdit(location)}>
            <Icon path={icons.edit} size={13} /> Edit
          </button>
          {isMaster && (
            <button className="btn btn-danger" style={{ padding: '8px 14px' }} onClick={() => onDelete(location)}>
              <Icon path={icons.trash} size={13} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="location-detail-tabs">
        <button className={`tab-btn ${locationTab === 'details' ? 'active' : ''}`} onClick={() => setLocationTab('details')}>
          <Icon path={icons.building} size={15} /> Details
        </button>
        <button className={`tab-btn ${locationTab === 'user_logs' ? 'active' : ''}`} onClick={() => setLocationTab('user_logs')}>
          <Icon path={icons.clock} size={15} /> User Logs
        </button>
        <button className={`tab-btn ${locationTab === 'enquiries' ? 'active' : ''}`} onClick={() => setLocationTab('enquiries')}>
          <Icon path={icons.mail} size={15} /> Enquiries
        </button>
      </div>

      {/* Details Tab */}
      {locationTab === 'details' && (
        <div className="card hq" style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 40px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Location Name</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{location.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Status</div>
              <div>{statusBadge(location.status || 'open')}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Address</div>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{location.address}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Contact Number</div>
              <div style={{ fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={icons.phone} size={14} /> {location.phone}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Email Address</div>
              <div style={{ fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={icons.mail} size={14} /> {location.email}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Created</div>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{formatDateValue(location.createdAt) || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Location ID</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{location.id}</div>
            </div>
          </div>
        </div>
      )}

      {/* User Logs Tab */}
      {locationTab === 'user_logs' && (
        <UserLogsTab locationId={location.id} locationName={location.name} />
      )}

      {locationTab === 'enquiries' && (
        <LocationEnquiriesTab locationId={location.id} />
      )}
    </>
  );
}

// --- Location Enquiries Tab (HQ) ------------------------------------------------
function LocationEnquiriesTab({ locationId }) {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(
          collection(db, 'locations', locationId, 'enquiries'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setEnquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Failed to load enquiries:", e); }
      setLoading(false);
    };
    load();
  }, [locationId]);

  const typeLabels = {
    vip_list: { label: 'VIP List', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
    coming_soon: { label: 'Coming Soon', bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.2)' },
    temporary_closed: { label: 'Temp. Closed', bg: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'rgba(239,68,68,0.2)' },
  };

  let filtered = [...enquiries];
  if (filter !== 'all') filtered = filtered.filter(e => e.type === filter);
  if (search.trim()) {
    const s = search.toLowerCase();
    filtered = filtered.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(s) ||
      (e.email || '').toLowerCase().includes(s) ||
      (e.phone || '').includes(s)
    );
  }

  if (loading) return <div className="card hq" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading enquiries...</div>;

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: 'var(--text)', outline: 'none' }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: '#fff', color: 'var(--text)', cursor: 'pointer' }}
        >
          <option value="all">All Types</option>
          <option value="vip_list">VIP List</option>
          <option value="coming_soon">Coming Soon</option>
          <option value="temporary_closed">Temporary Closed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card hq" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No enquiries found.</div>
      ) : (
        <div className="card hq" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(enq => {
                  const t = typeLabels[enq.type] || typeLabels.vip_list;
                  const date = enq.createdAt?.toDate ? enq.createdAt.toDate() : enq.createdAt?.seconds ? new Date(enq.createdAt.seconds * 1000) : null;
                  return (
                    <tr key={enq.id}>
                      <td style={{ fontWeight: 600 }}>{enq.firstName} {enq.lastName}</td>
                      <td><a href={`mailto:${enq.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{enq.email}</a></td>
                      <td><a href={`tel:${enq.phone?.replace(/\s/g, '')}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{enq.phone}</a></td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
                          {t.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {date ? date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// --- User Logs Tab ---------------------------------------------------------------
function UserLogsTab({ locationId, locationName }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState(null);
  const [filterAction, setFilterAction] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getActivityLogs(locationId);
        setLogs(data);
      } catch (e) {
        console.error("Failed to load activity logs:", e);
        setError(`Failed to load activity logs: ${e.code || ''} ${e.message || 'Unknown error'}`);
      }
      setLoading(false);
    };
    loadLogs();
  }, [locationId]);

  // Group logs by user
  const userMap = {};
  logs.forEach(log => {
    const key = log.userEmail || log.userId;
    if (!userMap[key]) {
      userMap[key] = {
        userId: log.userId,
        userName: log.userName || 'Unknown User',
        userEmail: log.userEmail || '',
        logs: [],
        lastActivity: null,
        lastSignIn: null,
        actionCounts: {},
      };
    }
    userMap[key].logs.push(log);

    // Track timestamps
    const ts = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp ? new Date(log.timestamp) : null;
    if (ts) {
      if (!userMap[key].lastActivity || ts > userMap[key].lastActivity) {
        userMap[key].lastActivity = ts;
      }
      if (log.action === 'sign_in' && (!userMap[key].lastSignIn || ts > userMap[key].lastSignIn)) {
        userMap[key].lastSignIn = ts;
      }
    }

    // Count actions
    const action = log.action || 'other';
    userMap[key].actionCounts[action] = (userMap[key].actionCounts[action] || 0) + 1;
  });

  const users = Object.values(userMap).sort((a, b) => {
    const aTime = a.lastActivity?.getTime() || 0;
    const bTime = b.lastActivity?.getTime() || 0;
    return bTime - aTime;
  });

  // Filter logs for the expanded user
  const getFilteredLogs = (userLogs) => {
    if (filterAction === 'all') return userLogs;
    return userLogs.filter(l => l.action === filterAction);
  };

  const formatUTCDate = (date) => {
    if (!date) return '—';
    return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  };

  const formatRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getActionBadgeClass = (action) => {
    const map = { sign_in: 'sign_in', sign_out: 'sign_out', edit: 'edit', create: 'create', delete: 'delete', update: 'update', view: 'view' };
    return map[action] || 'default';
  };

  const getActionLabel = (action) => {
    const map = { sign_in: 'Sign In', sign_out: 'Sign Out', edit: 'Edit', create: 'Create', delete: 'Delete', update: 'Update', view: 'View', resend_email: 'Resend Email' };
    return map[action] || action;
  };

  const buildSummary = (actionCounts) => {
    const parts = [];
    if (actionCounts.sign_in) parts.push(`${actionCounts.sign_in} sign-in${actionCounts.sign_in > 1 ? 's' : ''}`);
    if (actionCounts.edit) parts.push(`${actionCounts.edit} edit${actionCounts.edit > 1 ? 's' : ''}`);
    if (actionCounts.create) parts.push(`${actionCounts.create} create${actionCounts.create > 1 ? 's' : ''}`);
    if (actionCounts.delete) parts.push(`${actionCounts.delete} deletion${actionCounts.delete > 1 ? 's' : ''}`);
    const otherCount = Object.entries(actionCounts).filter(([k]) => !['sign_in', 'edit', 'create', 'delete'].includes(k)).reduce((s, [, v]) => s + v, 0);
    if (otherCount) parts.push(`${otherCount} other`);
    return parts.join(', ') || 'No actions';
  };

  // Gather unique action types for filter
  const allActionTypes = [...new Set(logs.map(l => l.action).filter(Boolean))].sort();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        Loading user logs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="log-empty">
        <div className="log-empty-icon" style={{ fontSize: 32 }}>⚠️</div>
        <div className="log-empty-text" style={{ color: 'var(--hq-danger, #e53e3e)' }}>Failed to load activity logs</div>
        <div className="log-empty-desc">{error}</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="log-empty">
        <div className="log-empty-icon">📋</div>
        <div className="log-empty-text">No user activity logs yet</div>
        <div className="log-empty-desc">
          Activity logs will appear here as users interact with this location.
          <br />
          Logged events include sign-ins, edits, creates, deletions, and more.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{users.length}</div>
          <div className="stat-label">Active Users</div>
        </div>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{logs.length}</div>
          <div className="stat-label">Total Actions</div>
        </div>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: '#059669', fontSize: 14, paddingTop: 6 }}>
            {users[0]?.lastActivity ? formatRelativeTime(users[0].lastActivity) : '—'}
          </div>
          <div className="stat-label">Last Activity</div>
        </div>
      </div>

      {/* Filter */}
      {allActionTypes.length > 1 && (
        <div className="log-filter-bar">
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Filter by action:</span>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{
            padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
            fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
            appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
          }}>
            <option value="all">All Actions</option>
            {allActionTypes.map(a => <option key={a} value={a}>{getActionLabel(a)}</option>)}
          </select>
          {filterAction !== 'all' && (
            <button onClick={() => setFilterAction('all')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--orange-pale)',
              color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear</button>
          )}
        </div>
      )}

      {/* User cards */}
      <div className="logs-container">
        {users.map((u) => {
          const isExpanded = expandedUser === u.userId;
          const filteredLogs = getFilteredLogs(u.logs);

          return (
            <div key={u.userId} className="log-user-card">
              {/* Collapsed header */}
              <div className="log-user-header" onClick={() => setExpandedUser(isExpanded ? null : u.userId)}>
                <div className="log-user-info">
                  <div className="log-user-avatar">
                    {u.userName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div className="log-user-details">
                    <div className="log-user-name">{u.userName}</div>
                    <div className="log-user-email">{u.userEmail}</div>
                  </div>
                </div>
                <div className="log-user-meta">
                  <div className="log-meta-item">
                    <div className="log-meta-label">Last Sign In</div>
                    <div className="log-meta-value">{u.lastSignIn ? formatUTCDate(u.lastSignIn) : '—'}</div>
                  </div>
                  <div className="log-meta-item">
                    <div className="log-meta-label">Last Activity</div>
                    <div className="log-meta-value">{formatUTCDate(u.lastActivity)}</div>
                  </div>
                  <div className="log-meta-item">
                    <div className="log-meta-label">Summary</div>
                    <div className="log-meta-value">
                      <span className="log-summary-badge">{buildSummary(u.actionCounts)}</span>
                    </div>
                  </div>
                </div>
                <div className={`log-expand-icon ${isExpanded ? 'open' : ''}`}>▾</div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="log-detail-panel">
                  {filteredLogs.length === 0 ? (
                    <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No actions match the selected filter.
                    </div>
                  ) : (
                    <table className="log-detail-table">
                      <thead>
                        <tr>
                          <th>Timestamp (UTC)</th>
                          <th>Action</th>
                          <th>Category</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log) => {
                          const ts = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp ? new Date(log.timestamp) : null;
                          return (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                                {ts ? formatUTCDate(ts) : '—'}
                              </td>
                              <td>
                                <span className={`log-action-badge ${getActionBadgeClass(log.action)}`}>
                                  {getActionLabel(log.action)}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>{log.category || '—'}</td>
                              <td>{log.details || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocationModal({ portal, editing, locations = [], onSave, onClose }) {
  const [name, setName] = useState(editing?.name || '');
  const [address, setAddress] = useState(editing?.address || '');
  const [countryCode, setCountryCode] = useState(editing ? editing.phone.split(' ')[0] : '+61');
  const [phoneNum, setPhoneNum] = useState(editing ? editing.phone.split(' ').slice(1).join(' ') : '');
  const [email, setEmail] = useState(editing?.email || '');
  const [status, setStatus] = useState(editing?.status || 'coming_soon');
  const [resendEmail, setResendEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const t = portal;
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Check for duplicates whenever name, address, or phone changes
  useEffect(() => {
    if (editing) return; // Don't check when editing
    const otherLocations = locations.filter(l => l.id !== editing?.id);
    const warnings = [];
    const fullPhone = `${countryCode} ${phoneNum}`.trim();

    if (name.trim()) {
      const match = otherLocations.find(l => l.name?.toLowerCase().trim() === name.toLowerCase().trim());
      if (match) warnings.push(`Location name "${name}" already exists`);
    }
    if (address.trim()) {
      const match = otherLocations.find(l => l.address?.toLowerCase().trim() === address.toLowerCase().trim());
      if (match) warnings.push(`Address "${address}" is already used by "${match.name}"`);
    }
    if (phoneNum.trim() && phoneNum.trim().length > 3) {
      const match = otherLocations.find(l => l.phone?.replace(/\s/g, '') === fullPhone.replace(/\s/g, ''));
      if (match) warnings.push(`Phone number is already used by "${match.name}"`);
    }

    if (warnings.length > 0) {
      setDuplicateWarning(warnings);
      setConfirmedDuplicate(false);
    } else {
      setDuplicateWarning(null);
      setConfirmedDuplicate(false);
    }
  }, [name, address, countryCode, phoneNum, editing, locations]);

  useEffect(() => {
    if (!addressInputRef.current || !window.google?.maps?.places) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ['establishment'],
      fields: ['formatted_address', 'name', 'formatted_phone_number', 'international_phone_number', 'website'],
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (place.formatted_address) {
        setAddress(place.formatted_address);
      }
      if (place.name) {
        setName(place.name);
      }
      // Auto-populate phone number
      if (place.international_phone_number) {
        // international_phone_number is like "+61 2 9999 8888"
        const intlPhone = place.international_phone_number;
        // Try to extract country code and number
        const match = intlPhone.match(/^(\+\d{1,3})\s(.+)$/);
        if (match) {
          setCountryCode(match[1]);
          setPhoneNum(match[2]);
        } else {
          setPhoneNum(intlPhone.replace(/^\+\d{1,3}\s?/, ''));
        }
      } else if (place.formatted_phone_number) {
        setPhoneNum(place.formatted_phone_number);
      }
      // Try to guess email from website domain (best effort)
      if (place.website && !email) {
        try {
          const domain = new URL(place.website).hostname.replace('www.', '');
          setEmail(`info@${domain}`);
        } catch (e) {}
      }
    });
    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!name || !address || !email) return;
    if (duplicateWarning && !confirmedDuplicate) return; // Must confirm duplicate first
    setResending(true);
    if (editing && resendEmail) {
      try {
        await resendConfirmationEmail(editing.id);
      } catch (err) {
        console.error("Failed to resend confirmation email:", err);
      }
    }
    onSave({ name, address, phone: `${countryCode} ${phoneNum}`, email, status }, editing?.id, resendEmail);
    setResending(false);
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
          <input ref={addressInputRef} className={`form-input ${t}`} value={address} onChange={e => setAddress(e.target.value)} placeholder="Search for a business name..." />
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
        <div className="form-group">
          <label className={`form-label ${t}`}>Status</label>
          <select
            className={`form-input ${t}`}
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ cursor: 'pointer' }}
          >
            <option value="vip_list">VIP List</option>
            <option value="coming_soon">Coming Soon</option>
            <option value="open">Open</option>
            <option value="temporary_closed">Temporary Closed</option>
          </select>
        </div>

        {editing && (
          <div className="form-group" style={{ marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: resendEmail ? 'var(--orange-pale)' : 'var(--bg)', border: resendEmail ? '1.5px solid var(--orange-border)' : '1.5px solid var(--border)', transition: 'all 0.15s' }}>
              <input
                type="checkbox"
                checked={resendEmail}
                onChange={e => setResendEmail(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--orange)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Re-send confirmation email</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Send a portal access email to {email || 'the franchise partner'}</div>
              </div>
            </label>
          </div>
        )}

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div style={{ margin: '12px 0', padding: '14px 16px', borderRadius: 10, background: '#fef3cd', border: '1.5px solid #f0d080' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#856404', marginBottom: 4 }}>Possible duplicate detected</div>
                {duplicateWarning.map((w, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#856404', lineHeight: 1.5 }}>• {w}</div>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(133,100,4,0.15)' }}>
              <input
                type="checkbox"
                checked={confirmedDuplicate}
                onChange={e => setConfirmedDuplicate(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#856404', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#856404' }}>I understand — create this location anyway</span>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button className={`btn btn-ghost ${t}`} onClick={onClose}>Cancel</button>
          <button className={`btn btn-primary ${t}`} onClick={handleSave} disabled={resending}>
            <Icon path={icons.check} size={14} />
            {resending ? 'Saving...' : editing ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Confirm Modal --------------------------------------------------------------
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

// --- Users Page ----------------------------------------------------------------
function UsersPage({ currentUser, hqUsers, setHqUsers, loading, setLoading, onInvite, onRemove, onSelectUser, onEdit, onResendInvite, onDeleteInvite }) {
  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');

        // Load actual HQ users
        const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'master_admin']));
        const snap = await getDocs(q);
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Load pending invites
        const invitesSnap = await getDocs(collection(db, 'invites'));
        const invites = invitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filter invites to only show pending ones that don't have a matching user
        const userEmails = new Set(users.map(u => u.email?.toLowerCase()));
        const pendingInvites = invites
          .filter(inv => inv.status === 'pending' && !userEmails.has(inv.email?.toLowerCase()))
          .map(inv => ({
            id: inv.id,
            inviteId: inv.id,
            name: inv.name,
            email: inv.email,
            jobTitle: inv.jobTitle || '',
            role: inv.role || 'admin',
            status: 'pending',
            createdAt: inv.createdAt,
            _isPendingInvite: true,
          }));

        setHqUsers([...users, ...pendingInvites]);
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
                  <tr key={u.id} onClick={() => !u._isPendingInvite && onSelectUser(u)} style={{ cursor: u._isPendingInvite ? 'default' : 'pointer', opacity: u._isPendingInvite ? 0.7 : 1 }}>
                    <td className="hq" style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: u._isPendingInvite ? 'rgba(100,100,120,0.1)' : 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u._isPendingInvite ? 'var(--text-muted)' : 'var(--orange)', fontWeight: 700, fontSize: 13 }}>
                          {u.name?.[0] || '?'}
                        </div>
                        {u.name}
                        {u.id === currentUser.uid && <span style={{ fontSize: 10, background: 'var(--orange-pale)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 20 }}>You</span>}
                        {u._isPendingInvite && <span style={{ fontSize: 10, background: 'rgba(217,119,6,0.1)', color: '#d97706', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(217,119,6,0.2)' }}>Pending</span>}
                      </div>
                    </td>
                    <td className="hq"><span className="td-muted hq">{u.email}</span></td>
                    <td className="hq"><span className="td-muted hq">{u.jobTitle || '—'}</span></td>
                    <td className="hq">
                      {u._isPendingInvite ? (
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
                          Invited
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: u.role === 'master_admin' ? 'rgba(200,169,110,0.15)' : 'rgba(100,100,120,0.2)', color: u.role === 'master_admin' ? 'var(--hq-accent)' : 'var(--hq-muted)' }}>
                          {u.role === 'master_admin' ? 'Master Admin' : 'Admin'}
                        </span>
                      )}
                    </td>
                    <td className="hq">
                      <div className="actions">
                        {!u._isPendingInvite && (
                          <>
                            <button className="btn btn-ghost hq" style={{ padding: '7px 12px' }} onClick={(e) => { e.stopPropagation(); onSelectUser(u); }}>
                              <Icon path={icons.eye} size={13} /> View
                            </button>
                            <button className="btn btn-ghost hq" style={{ padding: '7px 12px' }} onClick={(e) => { e.stopPropagation(); onEdit(u); }}>
                              <Icon path={icons.edit} size={13} /> Edit
                            </button>
                            {u.id !== currentUser.uid && (
                              <button className="btn btn-danger" style={{ padding: '7px 12px' }} onClick={(e) => { e.stopPropagation(); onRemove(u); }}>
                                <Icon path={icons.trash} size={13} /> Delete
                              </button>
                            )}
                          </>
                        )}
                        {u._isPendingInvite && (
                          <>
                            <button className="btn btn-ghost hq" style={{ padding: '7px 12px' }} onClick={(e) => { e.stopPropagation(); onResendInvite(u); }}>
                              <Icon path={icons.send} size={13} /> Re-send Invite
                            </button>
                            <button className="btn btn-danger" style={{ padding: '7px 12px' }} onClick={(e) => { e.stopPropagation(); onDeleteInvite(u); }}>
                              <Icon path={icons.trash} size={13} /> Delete Invite
                            </button>
                          </>
                        )}
                      </div>
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

// --- HQ User Detail View --------------------------------------------------------
function HqUserDetailView({ hqUser, currentUser, onBack, userDetailTab, setUserDetailTab, onEdit, onRemove, showToast }) {
  const roleBadge = (role) => {
    const isMasterAdmin = role === 'master_admin';
    return (
      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isMasterAdmin ? 'rgba(200,169,110,0.15)' : 'rgba(100,100,120,0.2)', color: isMasterAdmin ? 'var(--hq-accent)' : 'var(--hq-muted)', border: `1px solid ${isMasterAdmin ? 'rgba(200,169,110,0.3)' : 'rgba(100,100,120,0.25)'}` }}>
        {isMasterAdmin ? 'Master Admin' : 'Admin'}
      </span>
    );
  };

  const isCurrentUser = hqUser.id === currentUser.uid;

  return (
    <>
      {/* Header with back button */}
      <div className="location-detail-header">
        <button className="back-btn" onClick={onBack}>
          <span style={{ fontSize: 16 }}>←</span> Back to Users
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)', fontWeight: 700, fontSize: 15 }}>
              {hqUser.name?.[0] || '?'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{hqUser.name}</div>
            {roleBadge(hqUser.role)}
            {isCurrentUser && <span style={{ fontSize: 10, background: 'var(--orange-pale)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 20 }}>You</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginLeft: 48 }}>{hqUser.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isCurrentUser && (
            <button className="btn btn-ghost hq" style={{ padding: '8px 14px' }} onClick={() => onEdit(hqUser)}>
              <Icon path={icons.edit} size={13} /> Edit
            </button>
          )}
          {!isCurrentUser && (
            <button className="btn btn-danger" style={{ padding: '8px 14px' }} onClick={() => onRemove(hqUser)}>
              <Icon path={icons.trash} size={13} /> Remove
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="location-detail-tabs">
        <button className={`tab-btn ${userDetailTab === 'details' ? 'active' : ''}`} onClick={() => setUserDetailTab('details')}>
          <Icon path={icons.users} size={15} /> Details
        </button>
        <button className={`tab-btn ${userDetailTab === 'user_logs' ? 'active' : ''}`} onClick={() => setUserDetailTab('user_logs')}>
          <Icon path={icons.clock} size={15} /> User Logs
        </button>
      </div>

      {/* Details Tab */}
      {userDetailTab === 'details' && (
        <div className="card hq" style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 40px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Full Name</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{hqUser.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Role</div>
              <div>{roleBadge(hqUser.role)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Email Address</div>
              <div style={{ fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={icons.mail} size={14} /> {hqUser.email}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Job Title</div>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{hqUser.jobTitle || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>Created</div>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{formatDateValue(hqUser.createdAt) || formatDateValue(hqUser.updatedAt) || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>User ID</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{hqUser.id}</div>
            </div>
          </div>

          {/* Resend Invite Email Section */}
          {!isCurrentUser && hqUser.inviteId && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <ResendInviteButton inviteId={hqUser.inviteId} userName={hqUser.name} showToast={showToast} />
            </div>
          )}
        </div>
      )}

      {/* User Logs Tab */}
      {userDetailTab === 'user_logs' && (
        <HqUserLogsTab userId={hqUser.id} userName={hqUser.name} />
      )}
    </>
  );
}

// --- Resend Invite Button -------------------------------------------------------
function ResendInviteButton({ inviteId, userName, showToast }) {
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendInviteEmail(inviteId);
      showToast(`✓ Invite email re-sent to ${userName}.`);
    } catch (err) {
      console.error("Failed to resend invite:", err);
      showToast(`✗ Failed to resend invite email.`);
    }
    setResending(false);
  };

  return (
    <button className="btn btn-ghost hq" onClick={handleResend} disabled={resending} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon path={icons.mail} size={14} />
      {resending ? 'Sending...' : 'Re-send Invite Email'}
    </button>
  );
}

// --- HQ User Logs Tab -----------------------------------------------------------
function HqUserLogsTab({ userId, userName }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getHqUserLogs(userId);
        setLogs(data);
      } catch (e) {
        console.error("Failed to load HQ user logs:", e);
        setError(`Failed to load activity logs: ${e.code || ''} ${e.message || 'Unknown error'}`);
      }
      setLoading(false);
    };
    loadLogs();
  }, [userId]);

  const formatUTCDate = (date) => {
    if (!date) return '—';
    return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  };

  const formatRelativeTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getActionBadgeClass = (action) => {
    const map = { sign_in: 'sign_in', sign_out: 'sign_out', edit: 'edit', create: 'create', delete: 'delete', update: 'update', view: 'view' };
    return map[action] || 'default';
  };

  const getActionLabel = (action) => {
    const map = { sign_in: 'Sign In', sign_out: 'Sign Out', edit: 'Edit', create: 'Create', delete: 'Delete', update: 'Update', view: 'View', resend_email: 'Resend Email' };
    return map[action] || action;
  };

  // Action counts
  const actionCounts = {};
  logs.forEach(log => {
    const action = log.action || 'other';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  });

  // Last activity
  const lastActivity = logs.length > 0 ? (() => {
    const ts = logs[0].timestamp?.toDate ? logs[0].timestamp.toDate() : logs[0].timestamp ? new Date(logs[0].timestamp) : null;
    return ts;
  })() : null;

  // Last sign-in
  const lastSignIn = (() => {
    const signInLog = logs.find(l => l.action === 'sign_in');
    if (!signInLog) return null;
    return signInLog.timestamp?.toDate ? signInLog.timestamp.toDate() : signInLog.timestamp ? new Date(signInLog.timestamp) : null;
  })();

  // Filter
  const allActionTypes = [...new Set(logs.map(l => l.action).filter(Boolean))].sort();
  const filteredLogs = filterAction === 'all' ? logs : logs.filter(l => l.action === filterAction);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        Loading user logs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="log-empty">
        <div className="log-empty-icon" style={{ fontSize: 32 }}>⚠️</div>
        <div className="log-empty-text" style={{ color: 'var(--hq-danger, #e53e3e)' }}>Failed to load activity logs</div>
        <div className="log-empty-desc">{error}</div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="log-empty">
        <div className="log-empty-icon">📋</div>
        <div className="log-empty-text">No activity logs yet for {userName}</div>
        <div className="log-empty-desc">
          Activity logs will appear here as this user interacts with the portal.
          <br />
          Logged events include sign-ins, location edits, creates, deletions, and more.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary stats */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{logs.length}</div>
          <div className="stat-label">Total Actions</div>
        </div>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: '#059669', fontSize: 14, paddingTop: 6 }}>
            {lastSignIn ? formatRelativeTime(lastSignIn) : '—'}
          </div>
          <div className="stat-label">Last Sign In</div>
        </div>
        <div className="stat-card hq">
          <div className="stat-num" style={{ color: '#059669', fontSize: 14, paddingTop: 6 }}>
            {lastActivity ? formatRelativeTime(lastActivity) : '—'}
          </div>
          <div className="stat-label">Last Activity</div>
        </div>
      </div>

      {/* Filter */}
      {allActionTypes.length > 1 && (
        <div className="log-filter-bar">
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Filter by action:</span>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{
            padding: '7px 28px 7px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
            fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: '#fff', cursor: 'pointer',
            appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px',
          }}>
            <option value="all">All Actions</option>
            {allActionTypes.map(a => <option key={a} value={a}>{getActionLabel(a)}</option>)}
          </select>
          {filterAction !== 'all' && (
            <button onClick={() => setFilterAction('all')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--orange-pale)',
              color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear</button>
          )}
        </div>
      )}

      {/* Logs table */}
      <div className="card hq" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No actions match the selected filter.
          </div>
        ) : (
          <table className="log-detail-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Action</th>
                <th>Category</th>
                <th>Location</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const ts = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp ? new Date(log.timestamp) : null;
                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {ts ? formatUTCDate(ts) : '—'}
                    </td>
                    <td>
                      <span className={`log-action-badge ${getActionBadgeClass(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{log.category || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{log.locationName || log.locationId || '—'}</td>
                    <td>{log.details || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Edit HQ User Modal ---------------------------------------------------------
function EditHqUserModal({ hqUser, currentUser, onClose, onSaved }) {
  const [name, setName] = useState(hqUser.name || '');
  const [jobTitle, setJobTitle] = useState(hqUser.jobTitle || '');
  const [role, setRole] = useState(hqUser.role || 'admin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resendEmail, setResendEmail] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const updates = { name: name.trim(), jobTitle: jobTitle.trim(), role };
      await updateHqUser(hqUser.id, updates);

      // Log the edit action
      logUserAction({
        locationId: null,
        userId: currentUser.uid || currentUser.id?.toString(),
        userName: currentUser.name,
        userEmail: currentUser.email,
        action: 'edit',
        category: 'hq_user',
        details: `Updated HQ user "${name}" (role: ${role === 'master_admin' ? 'Master Admin' : 'Admin'})`,
        scope: 'hq',
      });

      // Resend invite email if requested
      if (resendEmail && hqUser.inviteId) {
        try {
          await resendInviteEmail(hqUser.inviteId);
        } catch (err) {
          console.error("Failed to resend invite email:", err);
        }
      }

      onSaved({ ...hqUser, ...updates });
    } catch (e) {
      console.error("Failed to update user:", e);
      setError('Failed to update user. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal hq">
        <div className="modal-title" style={{ color: 'var(--text)' }}>Edit HQ User</div>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}><Icon path={icons.alert} size={14} /> {error}</div>}

        <div className="form-group">
          <label className="form-label hq">Full Name</label>
          <input className="form-input hq" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jane Smith" />
        </div>
        <div className="form-group">
          <label className="form-label hq">Email Address</label>
          <input className="form-input hq" type="email" value={hqUser.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Email is tied to Google authentication and cannot be changed.</div>
        </div>
        <div className="form-group">
          <label className="form-label hq">Job Title</label>
          <input className="form-input hq" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Operations Manager" />
        </div>
        <div className="form-group">
          <label className="form-label hq">Role</label>
          <select className="form-input hq" value={role} onChange={e => setRole(e.target.value)} style={{ cursor: 'pointer' }}>
            <option value="admin">Admin</option>
            <option value="master_admin">Master Admin</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {role === 'master_admin' ? 'Full access — can manage users, locations, and all settings.' : 'Can add and edit locations, but cannot delete or manage users.'}
          </div>
        </div>

        {hqUser.inviteId && (
          <div className="form-group" style={{ marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: resendEmail ? 'var(--orange-pale)' : 'var(--bg)', border: resendEmail ? '1.5px solid var(--orange-border)' : '1.5px solid var(--border)', transition: 'all 0.15s' }}>
              <input
                type="checkbox"
                checked={resendEmail}
                onChange={e => setResendEmail(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--orange)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Re-send invite email</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Send a portal access email to {hqUser.email}</div>
              </div>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost hq" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary hq" onClick={handleSave} disabled={saving}>
            <Icon path={icons.check} size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Invite User Modal ----------------------------------------------------------
function InviteUserModal({ onClose, onInvited }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState('admin');
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
        role,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      onInvited({ id: docRef.id, name, email, jobTitle, role, status: 'pending', inviteId: docRef.id });
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
          They will receive an email with a link to sign in. They will have the selected access level for the HQ portal.
        </div>
        {error && <div className="auth-error" style={{ marginBottom: 16 }}><Icon path={icons.alert} size={14} /> {error}</div>}
        <div className="form-group">
          <label className="form-label hq">User Type</label>
          <select className="form-input hq" value={role} onChange={e => setRole(e.target.value)} style={{ cursor: 'pointer' }}>
            <option value="admin">Admin</option>
            <option value="master_admin">Master Admin</option>
          </select>
        </div>
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

// --- Franchise Partner Portal ---------------------------------------------------

// ── Session Students & Attendance Component ───────────────────────────────────
function SessionStudents({ bookingId, members }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Build a flat list of all children from members
  const allChildren = [];
  members.forEach(m => {
    (m.children || []).forEach(c => {
      allChildren.push({ name: c.name, grade: c.grade || '', parentName: m.name, parentEmail: m.email, parentPhone: m.phone });
    });
  });

  // Load students for this booking
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDocs(collection(db, 'bookings', bookingId, 'students'));
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('Failed to load students:', e); }
      setLoading(false);
    };
    if (bookingId) load();
  }, [bookingId]);

  const addStudent = async (child) => {
    // Check if already added
    if (students.some(s => s.name.toLowerCase() === child.name.toLowerCase())) return;
    try {
      const { addDoc, collection } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      const data = { name: child.name, grade: child.grade, parentName: child.parentName, parentEmail: child.parentEmail, attendance: '' };
      const ref = await addDoc(collection(db, 'bookings', bookingId, 'students'), data);
      setStudents(prev => [...prev, { id: ref.id, ...data }]);
    } catch (e) { console.error('Failed to add student:', e); }
    setShowAddDropdown(false);
    setSearchTerm('');
  };

  const removeStudent = async (studentId) => {
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      await deleteDoc(doc(db, 'bookings', bookingId, 'students', studentId));
      setStudents(prev => prev.filter(s => s.id !== studentId));
    } catch (e) { console.error('Failed to remove student:', e); }
  };

  const updateAttendance = async (studentId, attendance) => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      await setDoc(doc(db, 'bookings', bookingId, 'students', studentId), { attendance }, { merge: true });
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, attendance } : s));
    } catch (e) { console.error('Failed to update attendance:', e); }
  };

  const filteredChildren = allChildren.filter(c => {
    const term = searchTerm.toLowerCase();
    const alreadyAdded = students.some(s => s.name.toLowerCase() === c.name.toLowerCase());
    return !alreadyAdded && (c.name.toLowerCase().includes(term) || c.parentName.toLowerCase().includes(term));
  });

  const attendanceColors = {
    attended: { bg: '#ecfdf5', color: '#059669', label: 'Attended' },
    late: { bg: '#fffbeb', color: '#d97706', label: 'Late' },
    no_show: { bg: '#fef2f2', color: '#dc2626', label: 'No Show' },
  };

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--fp-border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fp-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Students ({students.length})
        </div>
        <button onClick={() => setShowAddDropdown(!showAddDropdown)} style={{
          padding: '5px 12px', borderRadius: 8, border: '1px solid var(--fp-accent)', background: 'rgba(109,203,202,0.08)',
          color: 'var(--fp-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Add
        </button>
      </div>

      {/* Add student dropdown */}
      {showAddDropdown && (
        <div style={{ marginBottom: 12, border: '1px solid var(--fp-border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
          <input
            type="text" placeholder="Search students..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} autoFocus
            style={{ width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--fp-border)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {filteredChildren.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: 'var(--fp-muted)', textAlign: 'center' }}>
                {allChildren.length === 0 ? 'No students found in Members.' : 'No matching students.'}
              </div>
            ) : filteredChildren.slice(0, 10).map((c, i) => (
              <div key={i} onClick={() => addStudent(c)} style={{
                padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--fp-text)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{c.grade ? `Grade ${c.grade} · ` : ''}{c.parentName}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--fp-accent)', fontWeight: 700 }}>Add</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student list with attendance */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--fp-muted)', textAlign: 'center', padding: 12 }}>Loading...</div>
      ) : students.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fp-muted)', textAlign: 'center', padding: 12, background: 'var(--fp-bg)', borderRadius: 8 }}>
          No students added yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {students.map(s => (
            <div key={s.id} style={{ padding: '10px 12px', background: 'var(--fp-bg)', borderRadius: 10, border: '1px solid #eef0f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--fp-text)' }}>{s.name}</div>
                  {s.grade && <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{s.grade.toString().toLowerCase().startsWith('grade') ? s.grade : `Grade ${s.grade}`}</div>}
                </div>
                <button onClick={() => removeStudent(s.id)} style={{
                  background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: '2px 6px',
                }}>Remove</button>
              </div>
              {/* Attendance radio buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(attendanceColors).map(([key, val]) => (
                  <button key={key} onClick={() => updateAttendance(s.id, key)} style={{
                    flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: s.attendance === key ? `2px solid ${val.color}` : '1px solid #e5e7eb',
                    background: s.attendance === key ? val.bg : '#fff',
                    color: s.attendance === key ? val.color : 'var(--fp-muted)',
                    transition: 'all 0.15s',
                  }}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New Session Modal ─────────────────────────────────────────────────────────
function NewSessionModal({ initialDate, initialHour, editing, services, tutors, members, saving, onSave, onClose }) {
  const [date, setDate] = useState(editing?.date || initialDate || '');
  const [time, setTime] = useState(editing?.time || (initialHour != null ? `${String(initialHour).padStart(2, '0')}:00` : ''));
  const [sessionType, setSessionType] = useState(editing?.sessionType || 'one_off');
  const [serviceId, setServiceId] = useState(editing?.serviceId || '');
  const [tutorId, setTutorId] = useState(editing?.tutorId || '');
  const [selectedStudents, setSelectedStudents] = useState([]); // [{name, grade, parentName, parentEmail}]
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Build flat list of all children from members
  const allChildren = [];
  (members || []).forEach(m => {
    (m.children || []).forEach(c => {
      allChildren.push({ name: c.name, grade: c.grade || '', parentName: m.name, parentEmail: m.email });
    });
  });

  // Load existing students when editing
  useEffect(() => {
    const loadStudents = async () => {
      if (!editing?.id) return;
      setStudentsLoading(true);
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDocs(collection(db, 'bookings', editing.id, 'students'));
        setSelectedStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('Failed to load students:', e); }
      setStudentsLoading(false);
    };
    loadStudents();
  }, [editing?.id]);

  // Generate 15-minute increment time options
  const timeOptions = [];
  for (let h = 6; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const label = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
      timeOptions.push({ val, label });
    }
  }

  // Filter tutors by selected service
  const filteredTutors = serviceId
    ? tutors.filter(t => (t.services || []).includes(serviceId))
    : tutors;

  // Reset tutor when service changes and current tutor can't do the new service
  useEffect(() => {
    if (tutorId && serviceId) {
      const tutor = tutors.find(t => t.id === tutorId);
      if (tutor && !(tutor.services || []).includes(serviceId)) {
        setTutorId('');
      }
    }
  }, [serviceId]);

  const selectedService = services.find(s => s.id === serviceId);
  const selectedTutor = tutors.find(t => t.id === tutorId);

  const handleSubmit = (editMode) => {
    if (!date || !time || !serviceId || !tutorId) return;
    onSave({
      date,
      time,
      sessionType,
      serviceId,
      serviceName: selectedService?.name || '',
      tutorId,
      tutorName: selectedTutor ? `${selectedTutor.firstName} ${selectedTutor.lastName}` : '',
      students: selectedStudents,
    }, editing?.id || null, editMode || null);
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '2px solid var(--fp-border)', background: '#fff',
    fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none',
  };

  const selectStyle = {
    ...inputStyle, cursor: 'pointer', appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px',
    paddingRight: 36,
  };

  const labelStyle = {
    fontSize: 13, fontWeight: 700, color: 'var(--fp-text)', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 24 }}>
          {editing ? 'Edit Session' : 'New Session'}
        </div>

        {/* Date */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Time */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Time *</label>
          <select value={time} onChange={e => setTime(e.target.value)} style={selectStyle}>
            <option value="">Select time...</option>
            {timeOptions.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
          </select>
        </div>

        {/* Session Type */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Session *</label>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)} style={selectStyle}>
            <option value="one_off">One Off</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>

        {/* Service */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Service *</label>
          <select value={serviceId} onChange={e => setServiceId(e.target.value)} style={selectStyle}>
            <option value="">Select service...</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {services.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--fp-muted)', marginTop: 4 }}>No services available. Services are managed in the HQ portal.</div>
          )}
        </div>

        {/* Tutor */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Tutor *</label>
          <select value={tutorId} onChange={e => setTutorId(e.target.value)} style={selectStyle}>
            <option value="">Select tutor...</option>
            {filteredTutors.map(t => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
          {serviceId && filteredTutors.length === 0 && (
            <div style={{ fontSize: 11, color: '#E25D25', marginTop: 4 }}>No tutors available for this service. Assign tutors to this service in the Tutors section.</div>
          )}
          {!serviceId && (
            <div style={{ fontSize: 11, color: 'var(--fp-muted)', marginTop: 4 }}>Select a service first to see available tutors.</div>
          )}
        </div>

        {/* Students */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Students</label>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type="text" placeholder="Search and add students..."
              value={studentSearchTerm}
              onChange={e => { setStudentSearchTerm(e.target.value); setShowStudentDropdown(true); }}
              onFocus={() => { if (studentSearchTerm) setShowStudentDropdown(true); }}
              style={inputStyle}
            />
            {showStudentDropdown && studentSearchTerm && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--fp-border)', borderRadius: 10, marginTop: 4, zIndex: 10, maxHeight: 160, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                {(() => {
                  const term = studentSearchTerm.toLowerCase();
                  const filtered = allChildren.filter(c =>
                    !selectedStudents.some(s => s.name.toLowerCase() === c.name.toLowerCase()) &&
                    (c.name.toLowerCase().includes(term) || c.parentName.toLowerCase().includes(term))
                  );
                  if (filtered.length === 0) return <div style={{ padding: 12, fontSize: 12, color: 'var(--fp-muted)', textAlign: 'center' }}>No matching students.</div>;
                  return filtered.slice(0, 8).map((c, i) => (
                    <div key={i} onClick={() => {
                      setSelectedStudents(prev => [...prev, { name: c.name, grade: c.grade, parentName: c.parentName, parentEmail: c.parentEmail }]);
                      setStudentSearchTerm('');
                      setShowStudentDropdown(false);
                    }} style={{
                      padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--fp-text)' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{c.grade ? `${c.grade} · ` : ''}{c.parentName}</div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
          {studentsLoading && <div style={{ fontSize: 12, color: 'var(--fp-muted)' }}>Loading students...</div>}
          {selectedStudents.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedStudents.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(109,203,202,0.1)',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--fp-text)',
                }}>
                  {s.name}{s.grade ? ` (${s.grade})` : ''}
                  <button onClick={() => setSelectedStudents(prev => prev.filter((_, j) => j !== i))} style={{
                    background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, fontFamily: 'inherit',
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost fp" onClick={onClose}>Cancel</button>
          {editing && editing.recurrenceRuleId ? (
            <>
              <button className="btn btn-ghost fp" style={{ border: '2px solid var(--fp-accent)', color: 'var(--fp-accent)' }}
                onClick={() => handleSubmit('this')}
                disabled={saving || !date || !time || !serviceId || !tutorId}
                style={{ opacity: (saving || !date || !time || !serviceId || !tutorId) ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Update This Only'}
              </button>
              <button className="btn btn-primary fp"
                onClick={() => handleSubmit('all')}
                disabled={saving || !date || !time || !serviceId || !tutorId}
                style={{ opacity: (saving || !date || !time || !serviceId || !tutorId) ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Update All Future'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary fp" onClick={() => handleSubmit()}
              disabled={saving || !date || !time || !serviceId || !tutorId}
              style={{ opacity: (saving || !date || !time || !serviceId || !tutorId) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : (editing ? 'Update Session' : 'Create Session')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tutor Add/Edit Modal ──────────────────────────────────────────────────────
function TutorModal({ editing, services, saving, onSave, onClose }) {
  const [firstName, setFirstName] = useState(editing?.firstName || '');
  const [lastName, setLastName] = useState(editing?.lastName || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [phone, setPhone] = useState(editing?.phone || '');
  const [role, setRole] = useState(editing?.role || 'Tutor');
  const [selectedServices, setSelectedServices] = useState(editing?.services || []);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(editing?.profilePictureUrl || '');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePictureFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const toggleService = (svcId) => {
    setSelectedServices(prev =>
      prev.includes(svcId) ? prev.filter(id => id !== svcId) : [...prev, svcId]
    );
  };

  const handleSubmit = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role,
      services: selectedServices,
      profilePictureFile,
      profilePictureUrl: editing?.profilePictureUrl || '',
    }, editing?.id || null);
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '2px solid var(--fp-border)', background: '#fff',
    fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none',
  };

  const labelStyle = {
    fontSize: 13, fontWeight: 700, color: 'var(--fp-text)', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 540, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 24 }}>
          {editing ? 'Edit Tutor' : 'Add Tutor'}
        </div>

        {/* Profile Picture */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
            background: 'rgba(109,203,202,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed var(--fp-border)', cursor: 'pointer', flexShrink: 0,
          }} onClick={() => fileInputRef.current?.click()}>
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24, color: 'var(--fp-muted)' }}>+</span>
            )}
          </div>
          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{
              padding: '7px 14px', borderRadius: 8, border: '2px solid var(--fp-border)', background: '#fff',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--fp-text)', cursor: 'pointer',
            }}>
              {previewUrl ? 'Change Photo' : 'Upload Photo'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--fp-muted)', marginTop: 4 }}>JPG, PNG. Max 5MB.</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {/* Name fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} placeholder="First name" />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} placeholder="Last name" />
          </div>
        </div>

        {/* Contact */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="tutor@example.com" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Contact Number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="+61 400 000 000" />
        </div>

        {/* Role */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{
            ...inputStyle, cursor: 'pointer', appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px',
            paddingRight: 36,
          }}>
            <option value="Tutor">Tutor</option>
            <option value="Manager">Manager</option>
          </select>
        </div>

        {/* Services multi-select */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Services</label>
          <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 8 }}>Select the services this tutor can deliver.</div>
          {services.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 10, background: 'var(--fp-bg)', color: 'var(--fp-muted)', fontSize: 13, textAlign: 'center' }}>
              No services available. Services are managed in the HQ portal.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {services.map(svc => {
                const isSelected = selectedServices.includes(svc.id);
                return (
                  <button key={svc.id} type="button" onClick={() => toggleService(svc.id)} style={{
                    padding: '7px 14px', borderRadius: 20, border: '2px solid',
                    borderColor: isSelected ? 'var(--fp-accent)' : 'var(--fp-border)',
                    background: isSelected ? 'rgba(109,203,202,0.12)' : '#fff',
                    color: isSelected ? 'var(--fp-accent)' : 'var(--fp-muted)',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    {isSelected ? '✓ ' : ''}{svc.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost fp" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary fp" onClick={handleSubmit} disabled={saving || !firstName.trim() || !lastName.trim()}
            style={{ opacity: (saving || !firstName.trim() || !lastName.trim()) ? 0.5 : 1 }}>
            {saving ? 'Saving...' : (editing ? 'Update Tutor' : 'Add Tutor')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FranchisePortal({ user, onLogout }) {
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem('fp_portal_page');
    return saved && ['bookings', 'members', 'enquiries', 'tutors', 'payments', 'settings'].includes(saved) ? saved : 'settings';
  });

  const setPagePersist = (p) => {
    setPage(p);
    localStorage.setItem('fp_portal_page', p);
  };
  const [availability, setAvailability] = useState(INITIAL_AVAILABILITY);
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [buffer, setBuffer] = useState(15);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);

  // Pricing options state
  const PRICING_OPTIONS = {
    membership: {
      label: 'Membership',
      items: [
        { id: 'foundation_phase_1', name: 'Foundation Memberships Phase 1', desc: 'Introductory membership for new students starting their learning journey. Includes foundational assessment and personalised learning plan.' },
        { id: 'foundation_phase_2', name: 'Foundation Memberships Phase 2', desc: 'Building on Phase 1 foundations with expanded subject coverage and increased session frequency.' },
        { id: 'foundation_phase_3', name: 'Foundation Memberships Phase 3', desc: 'Advanced foundation program with comprehensive subject mastery and exam preparation support.' },
        { id: 'membership_1_session', name: 'Membership (1 session)', desc: 'Standard weekly membership with one tutoring session per week covering core subjects.' },
        { id: 'membership_2_sessions', name: 'Membership (2 sessions)', desc: 'Enhanced weekly membership with two tutoring sessions per week for accelerated learning progress.' },
        { id: 'membership_unlimited', name: 'Membership (Unlimited)', desc: 'Premium all-access membership with unlimited tutoring sessions across all available subjects.' },
      ]
    },
    one_on_one: {
      label: 'Membership (One-on-one)',
      items: [
        { id: 'one_on_one_primary', name: 'One-on-One Session (Primary)', desc: 'Dedicated one-on-one tutoring for primary school students (K-6) tailored to individual learning needs.' },
        { id: 'one_on_one_secondary', name: 'One-on-One Session (Secondary)', desc: 'Personalised one-on-one tutoring for secondary school students (7-12) with subject-specific focus.' },
      ]
    },
    holiday_camps: {
      label: 'Holiday Camps',
      items: [
        { id: 'camp_coding', name: 'Coding', desc: 'Fun and engaging coding camp teaching programming fundamentals through hands-on projects and games.' },
        { id: 'camp_public_speaking', name: 'Public Speaking', desc: 'Build confidence and communication skills through structured public speaking exercises and presentations.' },
        { id: 'camp_creative_writing', name: 'Creative Writing', desc: 'Unlock creativity through storytelling, poetry, and narrative writing workshops with published author mentors.' },
        { id: 'camp_learn_ai', name: 'Learn AI', desc: 'Introduction to artificial intelligence concepts with age-appropriate activities and real-world applications.' },
        { id: 'camp_speed_typing', name: 'Speed Typing', desc: 'Develop fast and accurate typing skills through gamified lessons and timed challenges.' },
      ]
    }
  };
  const [pricing, setPricing] = useState({});
  const [pricingSaving, setPricingSaving] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [calendarView, setCalendarView] = useState('week'); // 'week' | 'day' | 'month'
  const [calendarDayOffset, setCalendarDayOffset] = useState(0); // for day view
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0); // for month view
  const [calendarFilter, setCalendarFilter] = useState(''); // search text for filtering sessions
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [saleSaving, setSaleSaving] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [stripeAccountStatus, setStripeAccountStatus] = useState(null); // {chargesEnabled, payoutsEnabled, detailsSubmitted}
  const [cardCollecting, setCardCollecting] = useState(null); // saleId being collected for
  const [locationStripeId, setLocationStripeId] = useState(null); // stripeAccountId from location doc
  const [cardFormState, setCardFormState] = useState(null); // { clientSecret, stripeAccountId } for embedded form
  const [cardFormSaving, setCardFormSaving] = useState(false);
  const [txLogStartDate, setTxLogStartDate] = useState('');
  const [txLogEndDate, setTxLogEndDate] = useState('');
  const [settingsTab, setSettingsTab] = useState('general'); // 'general' | 'marketing' | 'availability' | 'payments'
  const [locationData, setLocationData] = useState(null); // full location document for General tab
  const [marketingData, setMarketingData] = useState({ instagramUrl: '', facebookUrl: '' });
  const [currency, setCurrency] = useState('AUD');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [sessionModal, setSessionModal] = useState(null); // null | { date: 'YYYY-MM-DD', hour: number, editing?: booking }
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionDeleteConfirm, setSessionDeleteConfirm] = useState(null); // null | booking to delete

  // Members state
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [newMemberParent, setNewMemberParent] = useState({ name: '', email: '', phone: '' });
  const [newMemberChildren, setNewMemberChildren] = useState([{ name: '', grade: '' }]);
  const [memberTab, setMemberTab] = useState('profile'); // profile | timetable | payments
  const [editingMember, setEditingMember] = useState(null); // temp edit state
  const [memberSaving, setMemberSaving] = useState(false);

  // Unavailable dates state
  const [unavailableDates, setUnavailableDates] = useState([]); // [{ date, reason }]
  const [showUnavailModal, setShowUnavailModal] = useState(false);
  const [unavailDate, setUnavailDate] = useState('');
  const [unavailReason, setUnavailReason] = useState('');

  // Enquiries state
  const [enquiries, setEnquiries] = useState([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [enquirySearch, setEnquirySearch] = useState('');
  const [enquiryFilter, setEnquiryFilter] = useState('all');

  // Tutors state
  const [tutors, setTutors] = useState([]);
  const [tutorsLoading, setTutorsLoading] = useState(false);
  const [tutorSearch, setTutorSearch] = useState('');
  const [tutorFilter, setTutorFilter] = useState('all');
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [tutorModal, setTutorModal] = useState(null); // null | 'add' | { type: 'edit', tutor } | { type: 'delete', tutor }
  const [tutorSaving, setTutorSaving] = useState(false);
  const [locationServices, setLocationServices] = useState([]);

  const locationId = user.locationId?.toString() || user.uid?.toString();

  // Load bookings for this location
  useEffect(() => {
    const loadBookings = async () => {
      setBookingsLoading(true);
      try {
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(
          collection(db, 'bookings'),
          where('locationId', '==', locationId)
        );
        const snap = await getDocs(q);
        const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allBookings.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
        setBookings(allBookings);
      } catch (e) { console.error("Failed to load bookings:", e); }
      setBookingsLoading(false);
    };
    if (locationId) loadBookings();
  }, [locationId]);

  // Load enquiries for this location
  useEffect(() => {
    const loadEnquiries = async () => {
      setEnquiriesLoading(true);
      try {
        const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(
          collection(db, 'locations', locationId, 'enquiries'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setEnquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Failed to load enquiries:", e); }
      setEnquiriesLoading(false);
    };
    if (locationId) loadEnquiries();
  }, [locationId]);

  // Load tutors for this location (subcollection under location)
  useEffect(() => {
    const loadTutors = async () => {
      setTutorsLoading(true);
      try {
        const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(
          collection(db, 'locations', locationId, 'tutors'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setTutors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Failed to load tutors:", e); }
      setTutorsLoading(false);
    };
    if (locationId) loadTutors();
  }, [locationId]);

  // Load services available for this location (filtered by country/state)
  useEffect(() => {
    const loadLocationServices = async () => {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDocs(collection(db, 'services'));
        const allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLocationServices(allServices);
      } catch (e) { console.error("Failed to load services for tutors:", e); }
    };
    loadLocationServices();
  }, []);

  // Tutor CRUD
  const handleSaveTutor = async (data, editingId) => {
    setTutorSaving(true);
    try {
      const { doc, setDoc, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');

      // Handle image upload if a file is provided
      let profilePictureUrl = data.profilePictureUrl || '';
      if (data.profilePictureFile) {
        try {
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
          const { storage } = await import('./firebase.js');
          const fileName = `tutors/${locationId}/${Date.now()}_${data.profilePictureFile.name}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, data.profilePictureFile);
          profilePictureUrl = await getDownloadURL(storageRef);
        } catch (uploadErr) {
          console.error("Failed to upload image:", uploadErr);
          showToast('✗ Failed to upload profile picture.');
          setTutorSaving(false);
          return;
        }
      }

      const tutorData = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        role: data.role,
        services: data.services || [],
        profilePictureUrl,
      };

      if (editingId) {
        await setDoc(doc(db, 'locations', locationId, 'tutors', editingId), { ...tutorData, updatedAt: serverTimestamp() }, { merge: true });
        setTutors(prev => prev.map(t => t.id === editingId ? { ...t, ...tutorData } : t));
        if (selectedTutor?.id === editingId) setSelectedTutor(prev => ({ ...prev, ...tutorData }));
        showToast('✓ Tutor updated.');
      } else {
        const docRef = await addDoc(collection(db, 'locations', locationId, 'tutors'), { ...tutorData, createdAt: serverTimestamp() });
        setTutors(prev => [{ id: docRef.id, ...tutorData, createdAt: new Date() }, ...prev]);
        showToast('✓ Tutor added.');
      }
    } catch (err) {
      console.error("Failed to save tutor:", err);
      showToast('✗ Failed to save tutor.');
    }
    setTutorSaving(false);
    setTutorModal(null);
  };

  const handleDeleteTutor = async (id) => {
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      await deleteDoc(doc(db, 'locations', locationId, 'tutors', id));
      setTutors(prev => prev.filter(t => t.id !== id));
      if (selectedTutor?.id === id) setSelectedTutor(null);
      showToast('✓ Tutor deleted.');
    } catch (err) {
      console.error("Failed to delete tutor:", err);
      showToast('✗ Failed to delete tutor.');
    }
    setTutorModal(null);
  };

  // Helper: sync students to a booking's subcollection
  const syncStudentsToBooking = async (bookingId, students) => {
    const { collection, getDocs, addDoc, deleteDoc, doc } = await import('firebase/firestore');
    const { db } = await import('./firebase.js');
    // Get existing students
    const existingSnap = await getDocs(collection(db, 'bookings', bookingId, 'students'));
    const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Remove students no longer in list
    for (const ex of existing) {
      if (!students.some(s => s.name.toLowerCase() === ex.name.toLowerCase())) {
        await deleteDoc(doc(db, 'bookings', bookingId, 'students', ex.id));
      }
    }
    // Add new students
    for (const s of students) {
      if (!existing.some(ex => ex.name.toLowerCase() === s.name.toLowerCase())) {
        await addDoc(collection(db, 'bookings', bookingId, 'students'), {
          name: s.name, grade: s.grade || '', parentName: s.parentName || '', parentEmail: s.parentEmail || '', attendance: '',
        });
      }
    }
  };

  // Create Session handler
  // Helper: generate recurring session dates for the next 3 months from a given start date
  const generateRecurringDates = (startDate, dayOfWeek) => {
    const dates = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    // Find next occurrence of dayOfWeek from start
    let current = new Date(start);
    // Move to the correct day of week
    while (current.getDay() !== dayOfWeek) {
      current.setDate(current.getDate() + 1);
    }
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 7);
    }
    return dates;
  };

  const handleCreateSession = async (data) => {
    setSessionSaving(true);
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      const selectedSvc = locationServices?.find(s => s.id === data.serviceId);
      const duration = selectedSvc?.duration ? Number(selectedSvc.duration) : 40;

      if (data.sessionType === 'recurring') {
        // Create recurrence rule
        const startDateObj = new Date(data.date + 'T00:00:00');
        const dayOfWeek = startDateObj.getDay();
        const ruleData = {
          locationId,
          dayOfWeek,
          time: data.time,
          duration,
          serviceId: data.serviceId,
          serviceName: data.serviceName,
          tutorId: data.tutorId,
          tutorName: data.tutorName,
          status: 'active',
          startDate: data.date,
          createdAt: serverTimestamp(),
        };
        const ruleRef = await addDoc(collection(db, 'recurrence_rules'), ruleData);
        const ruleId = ruleRef.id;

        // Generate booking docs for the next 3 months
        const dates = generateRecurringDates(data.date, dayOfWeek);
        const newBookings = [];
        for (const date of dates) {
          const sessionData = {
            type: 'session',
            locationId,
            date,
            time: data.time,
            duration,
            sessionType: 'recurring',
            serviceId: data.serviceId,
            serviceName: data.serviceName,
            tutorId: data.tutorId,
            tutorName: data.tutorName,
            recurrenceRuleId: ruleId,
            status: 'scheduled',
            createdAt: serverTimestamp(),
          };
          const docRef = await addDoc(collection(db, 'bookings'), sessionData);
          newBookings.push({ id: docRef.id, ...sessionData, createdAt: new Date() });
          // Sync students to each occurrence
          if (data.students && data.students.length > 0) {
            await syncStudentsToBooking(docRef.id, data.students);
          }
        }
        setBookings(prev => [...prev, ...newBookings].sort((a, b) => a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)));
        showToast(`✓ Recurring session created (${dates.length} occurrences).`);
      } else {
        // One-off session (unchanged)
        const sessionData = {
          type: 'session',
          locationId,
          date: data.date,
          time: data.time,
          duration,
          sessionType: 'one_off',
          serviceId: data.serviceId,
          serviceName: data.serviceName,
          tutorId: data.tutorId,
          tutorName: data.tutorName,
          status: 'scheduled',
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'bookings'), sessionData);
        if (data.students && data.students.length > 0) {
          await syncStudentsToBooking(docRef.id, data.students);
        }
        setBookings(prev => [...prev, { id: docRef.id, ...sessionData, createdAt: new Date() }].sort((a, b) => a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)));
        showToast('✓ Session created.');
      }
    } catch (err) {
      console.error("Failed to create session:", err);
      showToast('✗ Failed to create session.');
    }
    setSessionSaving(false);
    setSessionModal(null);
  };

  // Edit Session handler — supports 'this' (single) or 'all' (series) mode
  const handleEditSession = async (data, sessionId, editMode) => {
    setSessionSaving(true);
    try {
      const { doc, setDoc, collection, getDocs, query, where, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      const selectedSvc = locationServices?.find(s => s.id === data.serviceId);
      const duration = selectedSvc?.duration ? Number(selectedSvc.duration) : 40;
      const updateData = {
        time: data.time,
        duration,
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        tutorId: data.tutorId,
        tutorName: data.tutorName,
        updatedAt: serverTimestamp(),
      };

      if (editMode === 'all') {
        // Find the recurrence rule and update it
        const session = bookings.find(b => b.id === sessionId);
        const ruleId = session?.recurrenceRuleId;
        if (ruleId) {
          // Update the rule
          await setDoc(doc(db, 'recurrence_rules', ruleId), {
            time: data.time,
            duration,
            serviceId: data.serviceId,
            serviceName: data.serviceName,
            tutorId: data.tutorId,
            tutorName: data.tutorName,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Update all future occurrences using local state
          const today = new Date().toISOString().split('T')[0];
          const toUpdate = bookings.filter(b => b.recurrenceRuleId === ruleId && b.date >= today);
          const batch = toUpdate.map(b => setDoc(doc(db, 'bookings', b.id), updateData, { merge: true }));
          await Promise.all(batch);
          // Sync students to all future occurrences
          if (data.students) {
            for (const b of toUpdate) {
              await syncStudentsToBooking(b.id, data.students);
            }
          }
          setBookings(prev => prev.map(b => (b.recurrenceRuleId === ruleId && b.date >= today) ? { ...b, ...updateData } : b));
          showToast('✓ All future sessions updated.');
        }
      } else {
        // Edit just this one occurrence
        await setDoc(doc(db, 'bookings', sessionId), { ...updateData, date: data.date }, { merge: true });
        if (data.students) {
          await syncStudentsToBooking(sessionId, data.students);
        }
        setBookings(prev => prev.map(b => b.id === sessionId ? { ...b, ...updateData, date: data.date } : b));
        showToast('✓ Session updated.');
      }
    } catch (err) {
      console.error("Failed to update session:", err);
      showToast('✗ Failed to update session.');
    }
    setSessionSaving(false);
    setSessionModal(null);
  };

  // Delete Session handler — supports 'this' (single) or 'all' (series) mode
  const handleDeleteSession = async (sessionId, deleteMode) => {
    try {
      const { doc, deleteDoc, setDoc, collection, getDocs, query, where, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');

      if (deleteMode === 'all') {
        const session = bookings.find(b => b.id === sessionId);
        const ruleId = session?.recurrenceRuleId;
        if (ruleId) {
          // Cancel the recurrence rule
          await setDoc(doc(db, 'recurrence_rules', ruleId), { status: 'cancelled', cancelledAt: serverTimestamp() }, { merge: true });

          // Delete all future occurrences using local state (avoids Firestore query/index issues)
          const today = new Date().toISOString().split('T')[0];
          const toDelete = bookings.filter(b => b.recurrenceRuleId === ruleId && b.date >= today);
          const deletes = toDelete.map(b => deleteDoc(doc(db, 'bookings', b.id)));
          const idsToRemove = toDelete.map(b => b.id);
          await Promise.all(deletes);
          setBookings(prev => prev.filter(b => !idsToRemove.includes(b.id)));
          showToast('✓ Recurring series deleted.');
        }
      } else {
        // Delete just this one occurrence
        await deleteDoc(doc(db, 'bookings', sessionId));
        setBookings(prev => prev.filter(b => b.id !== sessionId));
        showToast('✓ Session deleted.');
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
      showToast('✗ Failed to delete session.');
    }
    setSessionDeleteConfirm(null);
  };

  useEffect(() => {
    if (!bookings.length) { setMembers([]); return; }
    // Group bookings by email to create member profiles
    const memberMap = {};
    bookings.forEach(b => {
      const email = (b.customerEmail || '').toLowerCase().trim();
      if (!email) return;
      if (!memberMap[email]) {
        memberMap[email] = {
          id: email,
          parentFirstName: b.parentFirstName || b.customerName?.split(' ')[0] || '',
          parentLastName: b.parentLastName || b.customerName?.split(' ').slice(1).join(' ') || '',
          name: b.customerName || `${b.parentFirstName || ''} ${b.parentLastName || ''}`.trim(),
          email: b.customerEmail,
          phone: b.customerPhone || '',
          children: b.children || [],
          bookings: [],
          createdAt: b.createdAt,
        };
      }
      memberMap[email].bookings.push(b);
      // Merge children from all bookings
      if (b.children && b.children.length) {
        b.children.forEach(c => {
          const exists = memberMap[email].children.some(
            ec => ec.name.toLowerCase() === c.name.toLowerCase()
          );
          if (!exists) memberMap[email].children.push(c);
        });
      }
      // Update phone if newer booking has one
      if (b.customerPhone && !memberMap[email].phone) {
        memberMap[email].phone = b.customerPhone;
      }
    });
    // Classify member status
    const now = new Date();
    const vals = Object.values(memberMap).map(m => {
      const latestBooking = m.bookings.reduce((latest, b) => {
        const d = new Date(b.date);
        return d > latest ? d : latest;
      }, new Date(0));
      const daysSince = Math.floor((now - latestBooking) / (1000 * 60 * 60 * 24));
      // Lead = 1 booking only, Active = recent (within 60 days), Inactive = older than 60 days
      let status = 'active';
      if (m.bookings.length === 1 && daysSince < 30) status = 'lead';
      else if (daysSince > 60) status = 'inactive';
      return { ...m, status };
    });
    setMembers(vals.sort((a, b) => a.name.localeCompare(b.name)));
  }, [bookings]);

  // Save member profile edits to all their bookings
  const saveMemberProfile = async (edited) => {
    setMemberSaving(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./firebase.js');
      // Clean children - remove empty entries
      const cleanChildren = edited.children
        .filter(c => c.name && c.name.trim())
        .map(c => ({ name: c.name.trim(), grade: c.grade || '' }));
      const updates = {
        customerName: `${edited.parentFirstName.trim()} ${edited.parentLastName.trim()}`.trim(),
        parentFirstName: edited.parentFirstName.trim(),
        parentLastName: edited.parentLastName.trim(),
        customerEmail: edited.email.trim(),
        customerPhone: edited.phone.trim(),
        children: cleanChildren,
      };
      // Update all bookings for this member
      for (const b of selectedMember.bookings) {
        if (!b.id) { console.warn('Booking missing ID, skipping:', b); continue; }
        await updateDoc(doc(db, 'bookings', b.id), updates);
      }
      // Update local state
      setBookings(prev => prev.map(b =>
        selectedMember.bookings.some(sb => sb.id === b.id) ? { ...b, ...updates } : b
      ));
      setSelectedMember({ ...selectedMember, ...updates, name: updates.customerName, phone: updates.customerPhone, email: updates.customerEmail, children: cleanChildren });
      setEditingMember(null);
      setToast('Member profile updated');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      console.error('Failed to save member:', e);
      console.error('Error details:', e.code, e.message);
      alert('Failed to save: ' + (e.message || 'Unknown error. Check console for details.'));
    }
    setMemberSaving(false);
  };

  // Load availability (including unavailable dates)
  useEffect(() => {
    const loadAvail = async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDoc(doc(db, 'availability', locationId));
        if (snap.exists()) {
          const data = snap.data();
          if (data.schedule) setAvailability(data.schedule);
          if (data.timezone) setTimezone(data.timezone);
          if (data.bufferMinutes !== undefined) setBuffer(data.bufferMinutes);
          if (data.unavailableDates) setUnavailableDates(data.unavailableDates);
        }
      } catch (e) { console.error("Failed to load availability:", e); }
    };
    if (locationId) loadAvail();
  }, [locationId]);

  // Check Stripe Connect status + load location data
  useEffect(() => {
    const loadLocationData = async () => {
      if (!locationId) return;
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const locSnap = await getDoc(doc(db, 'locations', locationId));
        if (!locSnap.exists()) return;
        const locData = locSnap.data();
        setLocationData(locData);
        setLocationStripeId(locData.stripeAccountId || null);
        // Set currency based on country
        const countryToCurrency = { AU: 'AUD', NZ: 'NZD', US: 'USD', GB: 'GBP', CA: 'CAD', SG: 'SGD', HK: 'HKD', MY: 'MYR' };
        setCurrency(locData.currency || countryToCurrency[(locData.country || 'AU').toUpperCase()] || 'AUD');
        // Set marketing
        setMarketingData({ instagramUrl: locData.instagramUrl || '', facebookUrl: locData.facebookUrl || '' });
        // Check Stripe status
        if (!locData.stripeAccountId) { setStripeAccountStatus(null); return; }
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const fns = getFunctions();
        const checkStatus = httpsCallable(fns, 'checkStripeAccountStatus');
        const result = await checkStatus({ stripeAccountId: locData.stripeAccountId });
        setStripeAccountStatus(result.data);
        if (result.data.chargesEnabled && locData.stripeOnboardingStatus !== 'complete') {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'locations', locationId), { stripeOnboardingStatus: 'complete' }, { merge: true });
        }
      } catch (e) { console.error('Failed to load location data:', e); }
    };
    if (locationId) loadLocationData();
  }, [locationId]);

  // Detect Stripe return URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_connected') === 'true' || params.get('stripe_refresh') === 'true') {
      setPagePersist('settings');
      setSettingsTab('payments');
      window.history.replaceState({}, '', window.location.pathname);
      if (params.get('stripe_connected') === 'true') {
        showToast('✓ Stripe onboarding completed! Checking account status...');
      }
    }
    if (params.get('payment_setup') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('✓ Payment method saved! Syncing...');
      // Find the parent email from the sale or from members and call savePaymentFromCheckout
      const syncPayment = async () => {
        try {
          const saleId = params.get('sale_id');
          let parentEmail = null;
          if (saleId && saleId !== 'none' && saleId !== '') {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('./firebase.js');
            const saleDoc = await getDoc(doc(db, 'sales', saleId));
            if (saleDoc.exists()) parentEmail = saleDoc.data().parentEmail;
          }
          if (!parentEmail && selectedMember?.email) parentEmail = selectedMember.email;
          if (!parentEmail) { showToast('✓ Payment saved on Stripe. Reopen the member to see updated status.'); return; }
          const { getFunctions, httpsCallable } = await import('firebase/functions');
          const fns = getFunctions();
          const savePayment = httpsCallable(fns, 'savePaymentFromCheckout');
          const result = await savePayment({ parentEmail, locationId });
          showToast(`✓ ${result.data.brand} •••• ${result.data.last4} saved successfully!`);
          // Refresh sales
          const { collection, getDocs, query, where } = await import('firebase/firestore');
          const { db } = await import('./firebase.js');
          const q = query(collection(db, 'sales'), where('locationId', '==', locationId));
          const snap = await getDocs(q);
          setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error('Sync payment error:', e);
          showToast('✓ Payment saved on Stripe. Reopen the member to verify.');
        }
      };
      syncPayment();
    }
  }, []);

  // Load sales/memberships
  useEffect(() => {
    const loadSales = async () => {
      setSalesLoading(true);
      try {
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const q = query(collection(db, 'sales'), where('locationId', '==', locationId));
        const snap = await getDocs(q);
        setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      } catch (e) { console.error('Failed to load sales:', e); }
      setSalesLoading(false);
    };
    if (locationId) loadSales();
  }, [locationId]);

  // Load pricing settings
  useEffect(() => {
    const loadPricing = async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase.js');
        const snap = await getDoc(doc(db, 'pricing', locationId));
        if (snap.exists()) setPricing(snap.data());
      } catch (e) { console.error("Failed to load pricing:", e); }
    };
    if (locationId) loadPricing();
  }, [locationId]);

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
      await saveAvailability(locationId, {
        schedule: availability,
        timezone,
        bufferMinutes: buffer,
        unavailableDates,
      });
      showToast('✓ Availability saved successfully.');
    } catch (err) {
      console.error("Failed to save availability:", err);
      showToast('✗ Failed to save availability. Please try again.');
    }
  };

  const addUnavailableDate = () => {
    if (!unavailDate) return;
    if (unavailableDates.some(u => u.date === unavailDate)) {
      showToast('This date is already marked unavailable.');
      return;
    }
    setUnavailableDates(prev => [...prev, { date: unavailDate, reason: unavailReason }].sort((a, b) => a.date.localeCompare(b.date)));
    setUnavailDate('');
    setUnavailReason('');
    setShowUnavailModal(false);
  };

  const removeUnavailableDate = (date) => {
    setUnavailableDates(prev => prev.filter(u => u.date !== date));
  };

  const bufferOptions = [0, 15, 30, 45, 60];

  // Helper to format time
  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  // Current time in the franchise location's timezone
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const currentHour = nowInTz.getHours();
  const currentMin = nowInTz.getMinutes();
  const todayInTz = nowInTz; // "today" based on the location timezone

  return (
    <div className="layout fp" style={{ background: 'var(--fp-bg)' }}>
      <aside className="sidebar fp">
        <div className="sidebar-header">
          <img src="/logo-sticker.png" alt="" className="sidebar-logo-img" />
          <div className="sidebar-brand">
            <div className="sidebar-logo"><span>Success</span> Tutoring</div>
            <div className="sidebar-subtitle">Franchise Portal</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${page === 'bookings' ? 'active' : ''}`} onClick={() => setPagePersist('bookings')}>
            <Icon path={icons.users} size={16} /> Bookings
          </button>
          <button className={`nav-item ${page === 'members' ? 'active' : ''}`} onClick={() => setPagePersist('members')}>
            <Icon path={icons.users} size={16} /> Members
          </button>
          <button className={`nav-item ${page === 'enquiries' ? 'active' : ''}`} onClick={() => setPagePersist('enquiries')}>
            <Icon path={icons.mail} size={16} /> Enquiries
          </button>
          <button className={`nav-item ${page === 'tutors' ? 'active' : ''}`} onClick={() => { setPagePersist('tutors'); setSelectedTutor(null); }}>
            <Icon path={icons.users} size={16} /> Tutors
          </button>
          <button className={`nav-item ${page === 'payments' ? 'active' : ''}`} onClick={() => setPagePersist('payments')}>
            <Icon path={icons.creditCard} size={16} /> Payments
          </button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPagePersist('settings')}>
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


        {/* === BOOKINGS PAGE === */}
        {page === 'bookings' && (
          <>
            <div className="page-header">
              <div className="page-header-left">
                <div className="page-title" style={{ color: 'var(--fp-text)' }}>Upcoming Bookings</div>
                <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>View all assessment bookings for your centre.</div>
              </div>
            </div>

            {bookingsLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--fp-muted)' }}>Loading bookings...</div>
            ) : (() => {
              const today = todayInTz;

              // Apply calendar filter to bookings
              const filterTerm = calendarFilter.toLowerCase().trim();
              const filteredBookings = filterTerm ? bookings.filter(b => {
                return (b.serviceName || '').toLowerCase().includes(filterTerm)
                  || (b.tutorName || '').toLowerCase().includes(filterTerm)
                  || (b.customerName || '').toLowerCase().includes(filterTerm)
                  || (b.customerEmail || '').toLowerCase().includes(filterTerm)
                  || (b.customerPhone || '').toLowerCase().includes(filterTerm);
              }) : bookings;

              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - today.getDay() + 1 + calendarWeekOffset * 7);
              const weekDays = [];
              for (let i = 0; i < 7; i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                weekDays.push(d);
              }
              const weekLabel = `${weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — ${weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

              const weekStart = weekDays[0].toISOString().split('T')[0];
              const weekEnd = weekDays[6].toISOString().split('T')[0];
              const weekBookings = filteredBookings.filter(b => b.date >= weekStart && b.date <= weekEnd);

              const hours = [];
              for (let h = 8; h <= 21; h++) hours.push(h);

              // Is the current week being shown?
              const isCurrentWeek = weekDays.some(d => d.toDateString() === today.toDateString());

              return (
                <>
                  {/* View toggle + navigation */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--fp-bg)', borderRadius: 10, padding: 3 }}>
                      {['day', 'week', 'month'].map(v => (
                        <button key={v} className="btn btn-ghost fp" style={{
                          padding: '6px 14px', fontSize: 13, fontWeight: 700, textTransform: 'capitalize', borderRadius: 8,
                          ...(calendarView === v ? { background: '#fff', color: 'var(--fp-accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : {}),
                        }} onClick={() => setCalendarView(v)}>
                          {v}
                        </button>
                      ))}
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)' }}>
                      {calendarView === 'week' && weekLabel}
                      {calendarView === 'day' && (() => {
                        const d = new Date(today);
                        d.setDate(d.getDate() + calendarDayOffset);
                        return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                      })()}
                      {calendarView === 'month' && (() => {
                        const d = new Date(today.getFullYear(), today.getMonth() + calendarMonthOffset, 1);
                        return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                      })()}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost fp" style={{ padding: '8px 14px' }} onClick={() => {
                        if (calendarView === 'week') setCalendarWeekOffset(w => w - 1);
                        else if (calendarView === 'day') setCalendarDayOffset(d => d - 1);
                        else setCalendarMonthOffset(m => m - 1);
                      }}>
                        ←
                      </button>
                      <button className="btn btn-ghost fp" style={{
                        padding: '8px 14px',
                        ...((calendarView === 'week' ? calendarWeekOffset === 0 : calendarView === 'day' ? calendarDayOffset === 0 : calendarMonthOffset === 0) ? { background: 'rgba(109,203,202,0.1)', color: 'var(--fp-accent)', border: '1px solid var(--fp-accent)' } : {}),
                      }} onClick={() => {
                        if (calendarView === 'week') setCalendarWeekOffset(0);
                        else if (calendarView === 'day') setCalendarDayOffset(0);
                        else setCalendarMonthOffset(0);
                      }}>
                        Today
                      </button>
                      <button className="btn btn-ghost fp" style={{ padding: '8px 14px' }} onClick={() => {
                        if (calendarView === 'week') setCalendarWeekOffset(w => w + 1);
                        else if (calendarView === 'day') setCalendarDayOffset(d => d + 1);
                        else setCalendarMonthOffset(m => m + 1);
                      }}>
                        →
                      </button>
                    </div>
                  </div>

                  {/* Filter bar */}
                  <div style={{ marginBottom: 16 }}>
                    <input
                      type="text"
                      placeholder="Filter by service, tutor, student, parent name, email, or phone..."
                      value={calendarFilter}
                      onChange={e => setCalendarFilter(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10,
                        border: '2px solid var(--fp-border)', background: '#fff',
                        fontFamily: 'inherit', fontSize: 13, color: 'var(--fp-text)', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--fp-accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--fp-border)'}
                    />
                    {calendarFilter && (
                      <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>
                        Showing {filteredBookings.length} of {bookings.length} items
                      </div>
                    )}
                  </div>

                  {/* ── WEEK VIEW ── */}
                  {calendarView === 'week' && (<>
                  <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 700, position: 'relative' }}>
                        {/* Header row */}
                        <div style={{ padding: '12px 8px', borderBottom: '2px solid var(--fp-border)', borderRight: '1px solid var(--fp-border)', background: 'var(--fp-bg)' }} />
                        {weekDays.map((d, i) => {
                          const isToday = d.toDateString() === today.toDateString();
                          return (
                            <div key={i} style={{
                              padding: '10px 8px', textAlign: 'center',
                              borderBottom: '2px solid var(--fp-border)',
                              borderRight: i < 6 ? '1px solid var(--fp-border)' : 'none',
                              background: isToday ? 'rgba(109,203,202,0.18)' : 'var(--fp-bg)',
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#3d9695' : 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {d.toLocaleDateString('en-AU', { weekday: 'short' })}
                              </div>
                              <div style={{
                                fontSize: 18, fontWeight: 800, marginTop: 2,
                                width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: isToday ? 'var(--fp-accent)' : 'transparent',
                                color: isToday ? '#E25D25' : 'var(--fp-text)',
                                boxShadow: isToday ? '0 2px 8px rgba(109,203,202,0.4)' : 'none',
                              }}>
                                {d.getDate()}
                              </div>
                              {isToday && <div style={{ fontSize: 9, fontWeight: 700, color: '#3d9695', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today</div>}
                            </div>
                          );
                        })}

                        {/* Time grid */}
                        {hours.map((h, hi) => (
                          <div key={h} style={{ display: 'contents' }}>
                            <div style={{
                              padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--fp-muted)',
                              borderRight: '1px solid var(--fp-border)',
                              borderBottom: '1px solid #eef0f2',
                              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                              minHeight: 56, background: '#fafbfc', position: 'relative',
                            }}>
                              {h > 12 ? h - 12 : h}{h >= 12 ? 'PM' : 'AM'}
                              {isCurrentWeek && currentHour === h && (
                                <div style={{
                                  position: 'absolute', left: 0, right: 0, top: (currentMin / 60) * 56,
                                  height: 2, background: '#E25D25', zIndex: 5,
                                }} />
                              )}
                            </div>
                            {weekDays.map((d, di) => {
                              const dateStr = d.toISOString().split('T')[0];
                              const cellBookings = weekBookings.filter(b => {
                                if (b.date !== dateStr) return false;
                                const [bh] = b.time.split(':').map(Number);
                                return bh === h;
                              });
                              const isToday = d.toDateString() === today.toDateString();

                              // Check if this cell is unavailable
                              const jsDow = d.getDay(); // 0=Sun, 1=Mon...6=Sat
                              const availIdx = jsDow === 0 ? 6 : jsDow - 1; // Convert to Mon=0...Sun=6
                              const dayAvail = availability[availIdx];
                              const isUnavailableDate = unavailableDates.some(u => u.date === dateStr);
                              const isDayDisabled = !dayAvail?.enabled;
                              const startHour = dayAvail?.start ? parseInt(dayAvail.start.split(':')[0], 10) : 9;
                              const endHour = dayAvail?.end ? parseInt(dayAvail.end.split(':')[0], 10) : 17;
                              const isOutsideHours = dayAvail?.enabled ? (h < startHour || h >= endHour) : false;
                              const isUnavailable = isUnavailableDate || isDayDisabled || isOutsideHours;

                              // Current time indicator
                              const showTimeIndicator = isCurrentWeek && currentHour === h;
                              const timeIndicatorTop = showTimeIndicator ? (currentMin / 60) * 56 : 0;

                              return (
                                <div key={di} style={{
                                  borderRight: di < 6 ? '1px solid #eef0f2' : 'none',
                                  borderBottom: '1px solid #eef0f2',
                                  padding: 0, minHeight: 56, position: 'relative',
                                  background: isUnavailable ? '#f0f0f0' : isToday ? 'rgba(109,203,202,0.08)' : 'transparent',
                                  borderLeft: isToday ? '2px solid var(--fp-accent)' : 'none',
                                  borderLeftColor: isToday ? 'rgba(109,203,202,0.3)' : undefined,
                                  cursor: isUnavailable ? 'default' : 'pointer',
                                  overflow: 'visible',
                                  opacity: isUnavailable ? 0.6 : 1,
                                }}
                                onClick={() => {
                                  if (isUnavailable) return;
                                  const dateStr2 = d.toISOString().split('T')[0];
                                  setSessionModal({ date: dateStr2, hour: h });
                                }}
                                >
                                  {/* Current time line */}
                                  {showTimeIndicator && (
                                    <div style={{
                                      position: 'absolute', left: -2, right: 0, top: timeIndicatorTop,
                                      height: 2, background: '#E25D25', zIndex: 5,
                                      opacity: isToday ? 1 : 0.35,
                                    }}>
                                      {isToday && <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#E25D25', boxShadow: '0 0 4px rgba(226,93,37,0.5)' }} />}
                                    </div>
                                  )}
                                  {/* Time indicator in the hour label column too */}

                                  {cellBookings.map((b, bi) => {
                                    const [bh, bm] = b.time.split(':').map(Number);
                                    const timeLabel = fmtTime(b.time);
                                    const isSession = b.type === 'session';
                                    // Calculate duration and visual height
                                    const svcMatch = b.serviceId ? locationServices.find(s => s.id === b.serviceId) : null;
                                    const duration = b.duration ? Number(b.duration) : (svcMatch?.duration ? Number(svcMatch.duration) : 40);
                                    const topOffset = (bm / 60) * 56; // minutes into the hour -> px
                                    const heightPx = Math.max((duration / 60) * 56, 24); // duration in px, min 24px
                                    return (
                                      <div key={bi} onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); }} style={{
                                        position: 'absolute',
                                        top: topOffset + 2,
                                        left: 3,
                                        right: 3,
                                        height: heightPx - 4,
                                        background: isSession ? 'linear-gradient(135deg, #3d9695, #6DCBCA)' : 'linear-gradient(135deg, #E25D25, #f0845a)',
                                        color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11,
                                        cursor: 'pointer',
                                        lineHeight: 1.3, zIndex: 3,
                                        transition: 'transform 0.1s, box-shadow 0.1s',
                                        overflow: 'hidden',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = isSession ? '0 4px 12px rgba(109,203,202,0.4)' : '0 4px 12px rgba(226,93,37,0.3)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                      >
                                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isSession ? (b.serviceName || 'Session') : b.customerName}{b.recurrenceRuleId ? ' ↻' : ''}</div>
                                        <div style={{ opacity: 0.85, fontSize: 10 }}>{timeLabel}{isSession ? ` · ${b.tutorName || ''}` : ''}</div>
                                        {heightPx > 50 && <div style={{ opacity: 0.7, fontSize: 10, marginTop: 2 }}>{duration} min</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  </>)}

                  {/* ── DAY VIEW ── */}
                  {calendarView === 'day' && (() => {
                    const viewDay = new Date(today);
                    viewDay.setDate(viewDay.getDate() + calendarDayOffset);
                    const dateStr = viewDay.toISOString().split('T')[0];
                    const dayBookings = filteredBookings.filter(b => b.date === dateStr);
                    const jsDow = viewDay.getDay();
                    const availIdx = jsDow === 0 ? 6 : jsDow - 1;
                    const dayAvail = availability[availIdx];
                    const isUnavailableDate = unavailableDates.some(u => u.date === dateStr);

                    return (
                      <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', position: 'relative' }}>
                          {/* Header */}
                          <div style={{ padding: '12px 8px', borderBottom: '2px solid var(--fp-border)', borderRight: '1px solid var(--fp-border)', background: 'var(--fp-bg)' }} />
                          <div style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '2px solid var(--fp-border)', background: 'rgba(109,203,202,0.08)' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fp-accent)' }}>
                              {viewDay.toLocaleDateString('en-AU', { weekday: 'long' })}
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--fp-text)', marginTop: 2 }}>
                              {viewDay.getDate()}
                            </div>
                          </div>

                          {/* Hour rows */}
                          {hours.map(h => {
                            const startHour = dayAvail?.start ? parseInt(dayAvail.start.split(':')[0], 10) : 9;
                            const endHour = dayAvail?.end ? parseInt(dayAvail.end.split(':')[0], 10) : 17;
                            const isUnavailable = isUnavailableDate || !dayAvail?.enabled || h < startHour || h >= endHour;
                            const cellBookings = dayBookings.filter(b => {
                              const [bh] = b.time.split(':').map(Number);
                              return bh === h;
                            });

                            return (
                              <Fragment key={h}>
                                <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--fp-muted)', borderRight: '1px solid var(--fp-border)', borderBottom: '1px solid #eef0f2', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', minHeight: 64 }}>
                                  {fmtTime(`${String(h).padStart(2, '0')}:00`)}
                                </div>
                                <div style={{
                                  borderBottom: '1px solid #eef0f2', padding: 0, minHeight: 64, position: 'relative',
                                  background: isUnavailable ? '#f0f0f0' : 'transparent',
                                  opacity: isUnavailable ? 0.6 : 1,
                                  cursor: isUnavailable ? 'default' : 'pointer',
                                  overflow: 'visible',
                                }}
                                onClick={() => { if (!isUnavailable) setSessionModal({ date: dateStr, hour: h }); }}
                                >
                                  {cellBookings.map((b, bi) => {
                                    const [bh, bm] = b.time.split(':').map(Number);
                                    const timeLabel = fmtTime(b.time);
                                    const isSession = b.type === 'session';
                                    const svcMatch = b.serviceId ? locationServices.find(s => s.id === b.serviceId) : null;
                                    const duration = b.duration ? Number(b.duration) : (svcMatch?.duration ? Number(svcMatch.duration) : 40);
                                    const topOffset = (bm / 60) * 64;
                                    const heightPx = Math.max((duration / 60) * 64, 28);
                                    return (
                                      <div key={bi} onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); }} style={{
                                        position: 'absolute', top: topOffset + 2, left: 4, right: 4, height: heightPx - 4,
                                        background: isSession ? 'linear-gradient(135deg, #3d9695, #6DCBCA)' : 'linear-gradient(135deg, #E25D25, #f0845a)',
                                        color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13,
                                        cursor: 'pointer', zIndex: 3, overflow: 'hidden',
                                      }}>
                                        <div style={{ fontWeight: 700 }}>{isSession ? (b.serviceName || 'Session') : b.customerName}{b.recurrenceRuleId ? ' ↻' : ''}</div>
                                        <div style={{ opacity: 0.85, fontSize: 11 }}>{timeLabel}{isSession ? ` · ${b.tutorName || ''}` : ''} · {duration} min</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── MONTH VIEW ── */}
                  {calendarView === 'month' && (() => {
                    const monthDate = new Date(today.getFullYear(), today.getMonth() + calendarMonthOffset, 1);
                    const year = monthDate.getFullYear();
                    const month = monthDate.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const lastDay = new Date(year, month + 1, 0);
                    // Start grid on Monday
                    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
                    const gridStart = new Date(firstDay);
                    gridStart.setDate(gridStart.getDate() - startDow);
                    const cells = [];
                    const cursor = new Date(gridStart);
                    while (cells.length < 42) { // 6 weeks
                      cells.push(new Date(cursor));
                      cursor.setDate(cursor.getDate() + 1);
                    }

                    const monthStart = firstDay.toISOString().split('T')[0];
                    const monthEnd = lastDay.toISOString().split('T')[0];
                    const monthBookings = filteredBookings.filter(b => b.date >= monthStart && b.date <= monthEnd);

                    // Group by date
                    const byDate = {};
                    monthBookings.forEach(b => { byDate[b.date] = (byDate[b.date] || 0) + 1; });

                    return (
                      <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                          {/* Day names */}
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                            <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--fp-border)', background: 'var(--fp-bg)' }}>
                              {d}
                            </div>
                          ))}

                          {/* Date cells */}
                          {cells.map((c, ci) => {
                            const dateStr = c.toISOString().split('T')[0];
                            const isCurrentMonth = c.getMonth() === month;
                            const isToday2 = c.toDateString() === today.toDateString();
                            const count = byDate[dateStr] || 0;
                            const jsDow = c.getDay();
                            const availIdx2 = jsDow === 0 ? 6 : jsDow - 1;
                            const dayAvail2 = availability[availIdx2];
                            const isUnavail = !isCurrentMonth || !dayAvail2?.enabled || unavailableDates.some(u => u.date === dateStr);

                            // Get bookings for this day for dots
                            const dayItems = filteredBookings.filter(b => b.date === dateStr);
                            const hasSession = dayItems.some(b => b.type === 'session');
                            const hasBooking = dayItems.some(b => b.type !== 'session');

                            return (
                              <div key={ci} style={{
                                padding: '8px', minHeight: 80, borderBottom: '1px solid #eef0f2',
                                borderRight: (ci + 1) % 7 !== 0 ? '1px solid #eef0f2' : 'none',
                                background: isToday2 ? 'rgba(109,203,202,0.08)' : isUnavail ? '#f0f0f0' : '#fff',
                                opacity: isCurrentMonth ? 1 : 0.3,
                                cursor: isUnavail ? 'default' : 'pointer',
                              }}
                              onClick={() => {
                                if (!isUnavail && isCurrentMonth) {
                                  // Switch to week view containing this date
                                  const diff = Math.round((c - today) / (1000 * 60 * 60 * 24));
                                  const weekOffset = Math.floor(diff / 7);
                                  setCalendarWeekOffset(weekOffset);
                                  setCalendarView('week');
                                }
                              }}
                              >
                                <div style={{
                                  fontSize: 13, fontWeight: isToday2 ? 800 : 600,
                                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: isToday2 ? 'var(--fp-accent)' : 'transparent',
                                  color: isToday2 ? '#E25D25' : isCurrentMonth ? 'var(--fp-text)' : 'var(--fp-muted)',
                                }}>
                                  {c.getDate()}
                                </div>
                                {count > 0 && isCurrentMonth && (
                                  <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                                    {hasBooking && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E25D25' }} title="Bookings" />}
                                    {hasSession && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3d9695' }} title="Sessions" />}
                                    <span style={{ fontSize: 10, color: 'var(--fp-muted)', fontWeight: 600 }}>{count}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Summary stats — show in all views */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 }}>
                    <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>
                        {weekBookings.length}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>This Week</div>
                    </div>
                    <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>
                        {bookings.filter(b => b.date >= today.toISOString().split('T')[0]).length}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>Total Upcoming</div>
                    </div>
                    <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>
                        {bookings.length}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>All Time</div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* New/Edit Session Modal */}
            {sessionModal && (
              <NewSessionModal
                initialDate={sessionModal.date}
                initialHour={sessionModal.hour}
                editing={sessionModal.editing || null}
                services={locationServices}
                tutors={tutors}
                members={members}
                saving={sessionSaving}
                onSave={(data, editingId, editMode) => editingId ? handleEditSession(data, editingId, editMode) : handleCreateSession(data)}
                onClose={() => setSessionModal(null)}
              />
            )}

            {/* Delete Session Confirmation */}
            {sessionDeleteConfirm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setSessionDeleteConfirm(null)}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 8 }}>Delete Session</div>
                  <div style={{ fontSize: 14, color: 'var(--fp-muted)', marginBottom: 24, lineHeight: 1.6 }}>
                    {sessionDeleteConfirm.recurrenceRuleId
                      ? <>This is a <strong>recurring session</strong>. Would you like to delete just this occurrence or the entire series?</>
                      : <>Are you sure you want to delete the <strong>{sessionDeleteConfirm.serviceName || 'session'}</strong> on <strong>{sessionDeleteConfirm.date}</strong>? This action cannot be undone.</>
                    }
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost fp" onClick={() => setSessionDeleteConfirm(null)}>Cancel</button>
                    {sessionDeleteConfirm.recurrenceRuleId && (
                      <button style={{
                        padding: '10px 16px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#dc2626',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      }} onClick={() => handleDeleteSession(sessionDeleteConfirm.id, 'this')}>
                        Delete This Only
                      </button>
                    )}
                    <button style={{
                      padding: '10px 16px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                    }} onClick={() => handleDeleteSession(sessionDeleteConfirm.id, sessionDeleteConfirm.recurrenceRuleId ? 'all' : 'this')}>
                      {sessionDeleteConfirm.recurrenceRuleId ? 'Delete Entire Series' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* === ENQUIRIES PAGE === */}
        {page === 'enquiries' && (
          <>
            <div className="page-header">
              <div className="page-header-left">
                <div className="page-title" style={{ color: 'var(--fp-text)' }}>Enquiries</div>
                <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Leads from VIP List, Coming Soon, and Temporary Closed forms.</div>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <Icon path={icons.eye} size={14} />
                <input
                  placeholder="Search by name, email, or phone..."
                  value={enquirySearch}
                  onChange={(e) => setEnquirySearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px 10px 12px', borderRadius: 10, border: '1.5px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, background: 'var(--fp-card)', color: 'var(--fp-text)', outline: 'none' }}
                />
              </div>
              <select
                value={enquiryFilter}
                onChange={(e) => setEnquiryFilter(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, background: 'var(--fp-card)', color: 'var(--fp-text)', cursor: 'pointer' }}
              >
                <option value="all">All Types</option>
                <option value="vip_list">VIP List</option>
                <option value="coming_soon">Coming Soon</option>
                <option value="temporary_closed">Temporary Closed</option>
              </select>
            </div>

            {enquiriesLoading ? (
              <div className="card fp" style={{ padding: 40, textAlign: 'center', color: 'var(--fp-muted)' }}>Loading enquiries...</div>
            ) : (() => {
              const typeLabels = {
                vip_list: { label: 'VIP List', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
                coming_soon: { label: 'Coming Soon', bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.2)' },
                temporary_closed: { label: 'Temp. Closed', bg: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'rgba(239,68,68,0.2)' },
              };

              let filtered = [...enquiries];
              if (enquiryFilter !== 'all') filtered = filtered.filter(e => e.type === enquiryFilter);
              if (enquirySearch.trim()) {
                const s = enquirySearch.toLowerCase();
                filtered = filtered.filter(e =>
                  `${e.firstName} ${e.lastName}`.toLowerCase().includes(s) ||
                  (e.email || '').toLowerCase().includes(s) ||
                  (e.phone || '').includes(s)
                );
              }

              if (filtered.length === 0) {
                return <div className="card fp" style={{ padding: 40, textAlign: 'center', color: 'var(--fp-muted)' }}>No enquiries found.</div>;
              }

              return (
                <div className="card fp" style={{ overflow: 'hidden' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Type</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(enq => {
                          const t = typeLabels[enq.type] || typeLabels.vip_list;
                          const date = enq.createdAt?.toDate ? enq.createdAt.toDate() : enq.createdAt?.seconds ? new Date(enq.createdAt.seconds * 1000) : null;
                          return (
                            <tr key={enq.id}>
                              <td style={{ fontWeight: 600 }}>{enq.firstName} {enq.lastName}</td>
                              <td><a href={`mailto:${enq.email}`} style={{ color: 'var(--fp-accent)', textDecoration: 'none' }}>{enq.email}</a></td>
                              <td><a href={`tel:${enq.phone?.replace(/\s/g, '')}`} style={{ color: 'var(--fp-accent)', textDecoration: 'none' }}>{enq.phone}</a></td>
                              <td>
                                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
                                  {t.label}
                                </span>
                              </td>
                              <td style={{ fontSize: 13, color: 'var(--fp-muted)' }}>
                                {date ? date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* === TUTORS PAGE === */}
        {page === 'tutors' && (
          <>
            {selectedTutor ? (
              /* ── Tutor Detail View ── */
              <div>
                <button onClick={() => setSelectedTutor(null)} style={{
                  background: 'none', border: 'none', color: 'var(--fp-accent)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  ← Back to Tutors
                </button>
                <div className="card fp" style={{ padding: 28 }}>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Profile Picture */}
                    <div style={{
                      width: 100, height: 100, borderRadius: '50%', overflow: 'hidden',
                      background: 'rgba(109,203,202,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, border: '3px solid rgba(109,203,202,0.3)',
                    }}>
                      {selectedTutor.profilePictureUrl ? (
                        <img src={selectedTutor.profilePictureUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--fp-accent)' }}>
                          {(selectedTutor.firstName?.[0] || '')}{(selectedTutor.lastName?.[0] || '')}
                        </span>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 4 }}>
                        {selectedTutor.firstName} {selectedTutor.lastName}
                      </div>
                      <div style={{
                        display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16,
                        background: selectedTutor.role === 'Manager' ? 'rgba(226,93,37,0.1)' : 'rgba(109,203,202,0.15)',
                        color: selectedTutor.role === 'Manager' ? '#E25D25' : 'var(--fp-accent)',
                      }}>
                        {selectedTutor.role || 'Tutor'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--fp-text)' }}>
                          <Icon path={icons.mail} size={15} /> {selectedTutor.email || '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--fp-text)' }}>
                          <Icon path={icons.phone} size={15} /> {selectedTutor.phone || '—'}
                        </div>
                      </div>
                      {selectedTutor.services && selectedTutor.services.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Services</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {selectedTutor.services.map((s, i) => (
                              <span key={i} style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(109,203,202,0.12)', color: 'var(--fp-accent)', fontSize: 12, fontWeight: 600 }}>
                                {typeof s === 'string' ? (locationServices.find(ls => ls.id === s)?.name || s) : s.name || s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                        <button className="btn btn-primary fp" style={{ fontSize: 13, padding: '8px 18px' }} onClick={() => setTutorModal({ type: 'edit', tutor: selectedTutor })}>
                          <Icon path={icons.edit} size={13} /> Edit
                        </button>
                        <button className="btn btn-ghost fp" style={{ fontSize: 13, padding: '8px 18px', color: '#dc2626' }} onClick={() => setTutorModal({ type: 'delete', tutor: selectedTutor })}>
                          <Icon path={icons.trash} size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Tutors List View ── */
              <>
                <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="page-title" style={{ color: 'var(--fp-text)' }}>Tutors</div>
                    <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Manage tutors and managers at your centre.</div>
                  </div>
                  <button className="btn btn-primary fp" onClick={() => setTutorModal('add')}>
                    <Icon path={icons.plus} size={14} /> Add Tutor
                  </button>
                </div>

                {/* Search & Filter */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search by name, email, or phone..."
                    value={tutorSearch}
                    onChange={e => setTutorSearch(e.target.value)}
                    style={{
                      width: 360, padding: '12px 16px 12px 40px', borderRadius: 10,
                      border: '2px solid var(--fp-border)', background: '#fff',
                      fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)',
                      outline: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%239ca3af%27 stroke-width=%272%27 stroke-linecap=%27round%27%3e%3ccircle cx=%2711%27 cy=%2711%27 r=%278%27/%3e%3cline x1=%2721%27 y1=%2721%27 x2=%2716.65%27 y2=%2716.65%27/%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: '12px center',
                      backgroundSize: '18px',
                    }}
                  />
                  <select
                    value={tutorFilter}
                    onChange={e => setTutorFilter(e.target.value)}
                    style={{
                      padding: '12px 36px 12px 14px', borderRadius: 10,
                      border: '2px solid var(--fp-border)', background: '#fff',
                      fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)',
                      outline: 'none', cursor: 'pointer', fontWeight: 600,
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 10px center',
                      backgroundSize: '16px',
                    }}
                  >
                    <option value="all">All Roles</option>
                    <option value="Tutor">Tutor</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>

                {/* Tutors Table */}
                {tutorsLoading ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--fp-muted)' }}>Loading tutors...</div>
                ) : (() => {
                  const q = tutorSearch.toLowerCase().trim();
                  let filtered = tutors;
                  if (tutorFilter !== 'all') {
                    filtered = filtered.filter(t => t.role === tutorFilter);
                  }
                  if (q) {
                    filtered = filtered.filter(t =>
                      `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
                      (t.email || '').toLowerCase().includes(q) ||
                      (t.phone || '').includes(q)
                    );
                  }

                  if (!filtered.length) {
                    return (
                      <div className="card fp" style={{ padding: 40, textAlign: 'center', color: 'var(--fp-muted)' }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>👩‍🏫</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{q || tutorFilter !== 'all' ? 'No tutors match your search' : 'No tutors yet'}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Add your first tutor to get started.</div>
                        {!q && tutorFilter === 'all' && (
                          <button className="btn btn-primary fp" style={{ marginTop: 16 }} onClick={() => setTutorModal('add')}>
                            <Icon path={icons.plus} size={14} /> Add Tutor
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--fp-border)', textAlign: 'left' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Tutor</th>
                            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Role</th>
                            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Contact</th>
                            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Services</th>
                            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--fp-border)', cursor: 'pointer', transition: 'background 0.1s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              onClick={() => setSelectedTutor(t)}
                            >
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{
                                    width: 38, height: 38, borderRadius: '50%', overflow: 'hidden',
                                    background: 'rgba(109,203,202,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {t.profilePictureUrl ? (
                                      <img src={t.profilePictureUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fp-accent)' }}>
                                        {(t.firstName?.[0] || '')}{(t.lastName?.[0] || '')}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontWeight: 700, color: 'var(--fp-text)' }}>{t.firstName} {t.lastName}</div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{
                                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                  background: t.role === 'Manager' ? 'rgba(226,93,37,0.1)' : 'rgba(109,203,202,0.15)',
                                  color: t.role === 'Manager' ? '#E25D25' : 'var(--fp-accent)',
                                }}>
                                  {t.role || 'Tutor'}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px', color: 'var(--fp-muted)', fontSize: 13 }}>
                                <div>{t.email}</div>
                                {t.phone && <div style={{ marginTop: 2 }}>{t.phone}</div>}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {(t.services || []).slice(0, 3).map((s, i) => (
                                    <span key={i} style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(109,203,202,0.12)', color: 'var(--fp-accent)', fontSize: 11, fontWeight: 600 }}>
                                      {typeof s === 'string' ? (locationServices.find(ls => ls.id === s)?.name || s) : s.name || s}
                                    </span>
                                  ))}
                                  {(t.services || []).length > 3 && (
                                    <span style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--fp-bg)', color: 'var(--fp-muted)', fontSize: 11, fontWeight: 600 }}>
                                      +{t.services.length - 3}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                                <div className="actions">
                                  <button className="btn btn-ghost fp" style={{ padding: '7px 12px' }} onClick={() => setSelectedTutor(t)}>
                                    <Icon path={icons.building} size={13} /> View
                                  </button>
                                  <button className="btn btn-ghost fp" style={{ padding: '7px 12px' }} onClick={() => setTutorModal({ type: 'edit', tutor: t })}>
                                    <Icon path={icons.edit} size={13} /> Edit
                                  </button>
                                  <button className="btn btn-danger" style={{ padding: '7px 12px' }} onClick={() => setTutorModal({ type: 'delete', tutor: t })}>
                                    <Icon path={icons.trash} size={13} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Add/Edit Tutor Modal */}
            {(tutorModal === 'add' || tutorModal?.type === 'edit') && (
              <TutorModal
                editing={tutorModal?.tutor || null}
                services={locationServices}
                saving={tutorSaving}
                onSave={(data, editingId) => handleSaveTutor(data, editingId)}
                onClose={() => setTutorModal(null)}
              />
            )}

            {/* Delete Tutor Confirmation */}
            {tutorModal?.type === 'delete' && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setTutorModal(null)}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 8 }}>Delete Tutor</div>
                  <div style={{ fontSize: 14, color: 'var(--fp-muted)', marginBottom: 24, lineHeight: 1.6 }}>
                    Are you sure you want to delete <strong>{tutorModal.tutor.firstName} {tutorModal.tutor.lastName}</strong>? This action cannot be undone.
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost fp" onClick={() => setTutorModal(null)}>Cancel</button>
                    <button style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff',
                      fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    }} onClick={() => handleDeleteTutor(tutorModal.tutor.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* === SETTINGS PAGE === */}
        {page === 'settings' && (
          <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="page-title" style={{ color: 'var(--fp-text)' }}>Settings</div>
                <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Manage your centre's configuration and preferences.</div>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--fp-border)', marginBottom: 24 }}>
              {[
                { key: 'general', label: 'General', icon: icons.building },
                { key: 'marketing', label: 'Marketing', icon: icons.globe },
                { key: 'availability', label: 'Availability', icon: icons.calendar },
                { key: 'payments', label: 'Payments', icon: icons.creditCard },
              ].map(tab => (
                <button key={tab.key} onClick={() => setSettingsTab(tab.key)} style={{
                  padding: '12px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  border: 'none', borderBottom: settingsTab === tab.key ? '2px solid var(--fp-accent)' : '2px solid transparent',
                  background: 'none', color: settingsTab === tab.key ? 'var(--fp-accent)' : 'var(--fp-muted)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: -2,
                  transition: 'color 0.15s, border-color 0.15s',
                }}>
                  <Icon path={tab.icon} size={14} /> {tab.label}
                </button>
              ))}
            </div>

            {/* ── GENERAL TAB ── */}
            {settingsTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
                <div className="card fp" style={{ padding: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 16 }}>Location Details</div>
                  <div style={{ fontSize: 11, color: 'var(--fp-muted)', background: 'var(--fp-bg)', padding: '8px 12px', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon path={icons.shield} size={12} /> Managed by HQ — contact headquarters to update these fields.
                  </div>
                  {[
                    { label: 'Location Name', value: locationData?.name || '—' },
                    { label: 'Address', value: locationData?.address || '—' },
                    { label: 'Email', value: locationData?.email || '—' },
                    { label: 'Phone', value: locationData?.phone || '—' },
                  ].map(field => (
                    <div key={field.label} style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{field.label}</label>
                      <div style={{ padding: '11px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: 'var(--fp-bg)', fontSize: 14, color: 'var(--fp-text)', opacity: 0.7 }}>
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Timezone */}
                <div className="card fp" style={{ padding: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 4 }}>Timezone</div>
                  <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 16 }}>All bookings and availability times are displayed in this timezone.</div>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: '#fff',
                    fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none', cursor: 'pointer', appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px',
                  }}>
                    {['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth','Australia/Adelaide','Australia/Hobart','Pacific/Auckland','Pacific/Fiji','Asia/Singapore','Asia/Hong_Kong','America/New_York','America/Los_Angeles','America/Chicago','America/Denver','Europe/London','Europe/Paris'].map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div className="card fp" style={{ padding: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 4 }}>Currency</div>
                  <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 16 }}>Auto-detected from your location. Change if needed.</div>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: '#fff',
                    fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none', cursor: 'pointer', appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px',
                  }}>
                    {[{v:'AUD',l:'AUD — Australian Dollar'},{v:'NZD',l:'NZD — New Zealand Dollar'},{v:'USD',l:'USD — US Dollar'},{v:'GBP',l:'GBP — British Pound'},{v:'CAD',l:'CAD — Canadian Dollar'},{v:'SGD',l:'SGD — Singapore Dollar'},{v:'HKD',l:'HKD — Hong Kong Dollar'},{v:'MYR',l:'MYR — Malaysian Ringgit'}].map(c => (
                      <option key={c.v} value={c.v}>{c.l}</option>
                    ))}
                  </select>
                </div>

                <button className="btn btn-primary fp" style={{ alignSelf: 'flex-start' }} onClick={async () => {
                  try {
                    const { doc, setDoc } = await import('firebase/firestore');
                    const { db } = await import('./firebase.js');
                    await setDoc(doc(db, 'locations', locationId), { timezone, currency }, { merge: true });
                    showToast('\u2713 General settings saved.');
                  } catch (e) { showToast('\u2717 Failed to save.'); }
                }}>
                  <Icon path={icons.check} size={14} /> Save General Settings
                </button>
              </div>
            )}

            {/* ── MARKETING TAB ── */}
            {settingsTab === 'marketing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
                <div className="card fp" style={{ padding: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 16 }}>Social Media Links</div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Instagram</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                      </div>
                      <input type="url" placeholder="https://instagram.com/yourpage" value={marketingData.instagramUrl}
                        onChange={e => setMarketingData(prev => ({ ...prev, instagramUrl: e.target.value }))}
                        style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: '#fff', fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none' }} />
                      {marketingData.instagramUrl && (
                        <a href={marketingData.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fp-accent)', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open \u2192</a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Facebook</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                      </div>
                      <input type="url" placeholder="https://facebook.com/yourpage" value={marketingData.facebookUrl}
                        onChange={e => setMarketingData(prev => ({ ...prev, facebookUrl: e.target.value }))}
                        style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: '#fff', fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none' }} />
                      {marketingData.facebookUrl && (
                        <a href={marketingData.facebookUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fp-accent)', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open \u2192</a>
                      )}
                    </div>
                  </div>
                </div>

                <button className="btn btn-primary fp" style={{ alignSelf: 'flex-start' }} onClick={async () => {
                  try {
                    const { doc, setDoc } = await import('firebase/firestore');
                    const { db } = await import('./firebase.js');
                    await setDoc(doc(db, 'locations', locationId), { instagramUrl: marketingData.instagramUrl, facebookUrl: marketingData.facebookUrl }, { merge: true });
                    showToast('\u2713 Marketing settings saved.');
                  } catch (e) { showToast('\u2717 Failed to save.'); }
                }}>
                  <Icon path={icons.check} size={14} /> Save Marketing Settings
                </button>
              </div>
            )}

            {/* ── AVAILABILITY TAB ── */}
            {settingsTab === 'availability' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
                {/* Weekly Schedule */}
                <div className="card fp" style={{ padding: '28px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--fp-text)', fontSize: 15, marginBottom: 20 }}>Weekly Schedule</div>
                  <div className="timetable">
                    {availability.map((day, i) => {
                      const timeOptions = [];
                      for (let h = 6; h <= 22; h++) {
                        for (let m = 0; m < 60; m += 30) {
                          const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                          const ampm = h >= 12 ? 'PM' : 'AM';
                          const label = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
                          timeOptions.push({ val, label });
                        }
                      }
                      return (
                        <div key={day.day} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < availability.length - 1 ? '1px solid var(--fp-border)' : 'none' }}>
                          <div style={{ width: 100, flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: day.enabled ? 'var(--fp-text)' : 'var(--fp-muted)' }}>{day.day}</div>
                          </div>
                          <div onClick={() => toggleDay(i)} style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            background: day.enabled ? 'rgba(109,203,202,0.12)' : 'rgba(226,93,37,0.08)',
                            color: day.enabled ? '#3d9695' : '#c0552a',
                            border: `1px solid ${day.enabled ? 'rgba(109,203,202,0.3)' : 'rgba(226,93,37,0.2)'}`,
                          }}>{day.enabled ? 'Open' : 'Closed'}</div>
                          {day.enabled && (
                            <div className="time-inputs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <select value={day.start} onChange={e => updateTime(i, 'start', e.target.value)} style={{
                                padding: '8px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 13, color: 'var(--fp-text)', background: '#fff', outline: 'none', cursor: 'pointer',
                              }}>
                                {timeOptions.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                              </select>
                              <span style={{ color: 'var(--fp-muted)', fontWeight: 600 }}>to</span>
                              <select value={day.end} onChange={e => updateTime(i, 'end', e.target.value)} style={{
                                padding: '8px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 13, color: 'var(--fp-text)', background: '#fff', outline: 'none', cursor: 'pointer',
                              }}>
                                {timeOptions.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Unavailable Dates */}
                <div className="card fp" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--fp-text)', fontSize: 15 }}>Unavailable Dates</div>
                      <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2 }}>Block specific dates from bookings.</div>
                    </div>
                    <button className="btn btn-ghost fp" style={{ fontSize: 12 }} onClick={() => setShowUnavailModal(true)}>
                      <Icon path={icons.plus} size={12} /> Add Date
                    </button>
                  </div>
                  {unavailableDates.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--fp-muted)', fontSize: 13, background: 'var(--fp-bg)', borderRadius: 10, border: '1px dashed var(--fp-border)' }}>
                      No unavailable dates set. All enabled days are open for bookings.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {unavailableDates.map(u => {
                        const d = new Date(u.date + 'T00:00:00');
                        const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                        const isPast = u.date < new Date().toISOString().split('T')[0];
                        return (
                          <div key={u.date} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: isPast ? 'var(--fp-bg)' : '#fff', borderRadius: 8, border: '1px solid var(--fp-border)', opacity: isPast ? 0.5 : 1 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(226,93,37,0.08)', color: '#E25D25', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800 }}>
                              <div style={{ lineHeight: 1 }}>{d.getDate()}</div>
                              <div style={{ fontSize: 8, textTransform: 'uppercase' }}>{d.toLocaleDateString('en-AU', { month: 'short' })}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fp-text)' }}>{label}</div>
                              {u.reason && <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{u.reason}</div>}
                            </div>
                            <button onClick={() => removeUnavailableDate(u.date)} style={{ background: 'none', border: 'none', color: 'var(--fp-muted)', cursor: 'pointer', padding: '4px 8px', fontSize: 12, fontWeight: 600 }}>\u2715</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Booking Buffer */}
                <div className="card fp" style={{ padding: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 4 }}>Booking Buffer</div>
                  <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 16 }}>Minimum gap between the last available booking slot and closing time.</div>
                  <div className="buffer-chips" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[{ val: 0, label: 'None' }, { val: 15, label: '15 min' }, { val: 30, label: '30 min' }, { val: 45, label: '45 min' }, { val: 60, label: '60 min' }].map(opt => (
                      <div key={opt.val} onClick={() => setBuffer(opt.val)} style={{
                        padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'center', minWidth: 80,
                        border: `2px solid ${buffer === opt.val ? 'var(--fp-accent)' : 'var(--fp-border)'}`,
                        background: buffer === opt.val ? 'rgba(109,203,202,0.08)' : '#fff',
                        color: buffer === opt.val ? 'var(--fp-accent)' : 'var(--fp-text)',
                      }}>{opt.label}</div>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary fp" style={{ alignSelf: 'flex-start' }} onClick={handleSave}>
                  <Icon path={icons.check} size={14} /> Save Availability
                </button>
              </div>
            )}

            {/* ── PAYMENTS TAB ── */}
            {settingsTab === 'payments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
                {/* Stripe Connect */}
                <div className="card fp" style={{ padding: '24px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 16 }}>Stripe Payments</div>
                  {(() => {
                    const hasStripe = !!locationStripeId;
                    const isConnected = stripeAccountStatus?.chargesEnabled && stripeAccountStatus?.payoutsEnabled;

                    if (isConnected) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon path={icons.check} size={22} style={{ color: '#059669' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#059669' }}>Stripe Connected</div>
                            <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2 }}>Payments and payouts are enabled. Account: {locationStripeId}</div>
                          </div>
                          <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost fp" style={{ fontSize: 12, textDecoration: 'none' }}>Open Stripe Dashboard \u2192</a>
                        </div>
                      );
                    }
                    if (hasStripe && !isConnected) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon path={icons.alert} size={22} style={{ color: '#d97706' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: '#d97706' }}>Onboarding Incomplete</div>
                            <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2 }}>Your Stripe account needs additional information before you can accept payments.</div>
                          </div>
                          <button className="btn btn-primary fp" disabled={stripeConnecting} onClick={async () => {
                            setStripeConnecting(true);
                            try {
                              const { getFunctions, httpsCallable } = await import('firebase/functions');
                              const fns = getFunctions();
                              const createAccount = httpsCallable(fns, 'createStripeConnectAccount');
                              const result = await createAccount({ locationId });
                              window.open(result.data.url, '_blank');
                            } catch (e) { console.error('Stripe connect error:', e); showToast('\u2717 Failed to open Stripe onboarding.'); }
                            setStripeConnecting(false);
                          }}>{stripeConnecting ? 'Opening...' : 'Complete Onboarding'}</button>
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--fp-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon path={icons.creditCard} size={22} style={{ color: 'var(--fp-muted)' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)' }}>Connect Stripe</div>
                          <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2, lineHeight: 1.5 }}>Connect your Stripe account to accept card payments. Payments go directly to your account.</div>
                        </div>
                        <button className="btn btn-primary fp" disabled={stripeConnecting} onClick={async () => {
                          setStripeConnecting(true);
                          try {
                            const { getFunctions, httpsCallable } = await import('firebase/functions');
                            const fns = getFunctions();
                            const createAccount = httpsCallable(fns, 'createStripeConnectAccount');
                            const result = await createAccount({ locationId });
                            window.open(result.data.url, '_blank');
                          } catch (e) { console.error('Stripe connect error:', e); showToast('\u2717 Failed to start Stripe onboarding.'); }
                          setStripeConnecting(false);
                        }}>{stripeConnecting ? 'Setting up...' : 'Connect Stripe'}</button>
                      </div>
                    );
                  })()}
                </div>

                {/* Pricing Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 4 }}>Pricing Options</div>
                    <div style={{ fontSize: 12, color: 'var(--fp-muted)' }}>Toggle services on or off and set pricing for your centre.</div>
                  </div>

                  {Object.entries(PRICING_OPTIONS).map(([catKey, category]) => (
                    <div key={catKey} className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--fp-border)', background: 'var(--fp-bg)' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)' }}>{category.label}</div>
                      </div>
                      {category.items.map((item, idx) => {
                        const enabled = pricing[item.id]?.enabled ?? false;
                        const price = pricing[item.id]?.price ?? '';
                        return (
                          <div key={item.id} style={{ padding: '16px 20px', borderBottom: idx < category.items.length - 1 ? '1px solid var(--fp-border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <div onClick={() => setPricing(prev => ({ ...prev, [item.id]: { ...prev[item.id], enabled: !enabled, price: prev[item.id]?.price || '' } }))}
                              style={{ width: 44, height: 24, borderRadius: 12, background: enabled ? '#3d9695' : '#d1d5db', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginTop: 2 }}>
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: enabled ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: enabled ? 'var(--fp-text)' : 'var(--fp-muted)' }}>{item.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
                            </div>
                            <div style={{ flexShrink: 0, width: 110, opacity: enabled ? 1 : 0.4 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Price</div>
                              <div style={{ display: 'flex', alignItems: 'center', border: '2px solid var(--fp-border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                <span style={{ padding: '8px 8px 8px 10px', color: 'var(--fp-muted)', fontSize: 14, fontWeight: 700 }}>$</span>
                                <input type="number" min="0" step="0.01" value={price} disabled={!enabled}
                                  onChange={e => setPricing(prev => ({ ...prev, [item.id]: { ...prev[item.id], enabled, price: e.target.value } }))}
                                  placeholder="0.00"
                                  style={{ width: '100%', padding: '8px 8px 8px 0', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--fp-text)', background: 'transparent' }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <button className="btn btn-primary fp" style={{ alignSelf: 'flex-start' }} disabled={pricingSaving} onClick={async () => {
                    setPricingSaving(true);
                    try {
                      const { doc, setDoc } = await import('firebase/firestore');
                      const { db } = await import('./firebase.js');
                      await setDoc(doc(db, 'pricing', locationId), pricing);
                      showToast('\u2713 Pricing saved.');
                    } catch (e) { console.error('Failed to save pricing:', e); showToast('\u2717 Failed to save pricing.'); }
                    setPricingSaving(false);
                  }}>
                    <Icon path={icons.check} size={14} /> {pricingSaving ? 'Saving...' : 'Save Pricing'}
                  </button>
                </div>
              </div>
            )}

            {/* Unavailable Date Modal */}
            {showUnavailModal && (
              <div className="modal-overlay" onClick={() => setShowUnavailModal(false)}>
                <div className="modal fp" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                  <div className="modal-header fp">
                    <div className="modal-title fp">Add Unavailable Date</div>
                    <button className="modal-close" onClick={() => setShowUnavailModal(false)}>\u2715</button>
                  </div>
                  <div className="modal-body" style={{ padding: '24px' }}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Date</label>
                      <input type="date" className="form-input fp" value={unavailDate} onChange={e => setUnavailDate(e.target.value)} min={new Date().toISOString().split('T')[0]} style={{ width: '100%' }} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Reason (optional)</label>
                      <input type="text" className="form-input fp" value={unavailReason} onChange={e => setUnavailReason(e.target.value)} placeholder="e.g. Public holiday, Staff training" style={{ width: '100%' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost fp" onClick={() => setShowUnavailModal(false)}>Cancel</button>
                      <button className="btn btn-primary fp" onClick={addUnavailableDate} disabled={!unavailDate}>
                        <Icon path={icons.check} size={14} /> Add Date
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}


        {/* === MEMBERS PAGE === */}
        {page === 'members' && (
          <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="page-title" style={{ color: 'var(--fp-text)' }}>Members</div>
                <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>View parent and child profiles from bookings at your centre.</div>
              </div>
              <button className="btn btn-primary fp" onClick={() => setShowAddMemberModal(true)}>
                <Icon path={icons.plus} size={14} /> Add Member
              </button>
            </div>

            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                style={{
                  width: 360, padding: '12px 16px 12px 40px', borderRadius: 10,
                  border: '2px solid var(--fp-border)', background: '#fff',
                  fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)',
                  outline: 'none',
                  backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%239ca3af%27 stroke-width=%272%27 stroke-linecap=%27round%27%3e%3ccircle cx=%2711%27 cy=%2711%27 r=%278%27/%3e%3cline x1=%2721%27 y1=%2721%27 x2=%2716.65%27 y2=%2716.65%27/%3e%3c/svg%3e")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '12px center',
                  backgroundSize: '18px',
                }}
              />
              <select
                value={memberFilter}
                onChange={e => setMemberFilter(e.target.value)}
                style={{
                  padding: '12px 36px 12px 14px', borderRadius: 10,
                  border: '2px solid var(--fp-border)', background: '#fff',
                  fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)',
                  outline: 'none', cursor: 'pointer', fontWeight: 600,
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '16px',
                }}
              >
                <option value="all">All Members</option>
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Members List */}
            {(() => {
              const q = memberSearch.toLowerCase().trim();
              let filtered = members;
              if (memberFilter !== 'all') {
                filtered = filtered.filter(m => m.status === memberFilter);
              }
              if (q) {
                filtered = filtered.filter(m =>
                    m.name.toLowerCase().includes(q) ||
                    m.email.toLowerCase().includes(q) ||
                    (m.phone || '').includes(q) ||
                    m.children.some(c => c.name.toLowerCase().includes(q))
                  );
              }

              if (!filtered.length) {
                return (
                  <div className="card fp" style={{ padding: 40, textAlign: 'center', color: 'var(--fp-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{q ? 'No members match your search' : 'No members yet'}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Members appear here once they book an assessment.</div>
                  </div>
                );
              }

              return (
                <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--fp-border)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Parent</th>
                        <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Children</th>
                        <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Contact</th>
                        <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Status</th>
                        <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Bookings</th>
                        <th style={{ padding: '12px 16px', width: 100 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--fp-border)', cursor: 'pointer', transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => { setSelectedMember(m); setMemberTab('profile'); }}
                        >
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--fp-text)' }}>{m.name}</div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            {m.children.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {m.children.map((c, i) => (
                                  <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(109,203,202,0.12)', color: 'var(--fp-accent)', fontSize: 12, fontWeight: 600 }}>
                                    {c.name}{c.grade ? ` (${c.grade})` : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--fp-muted)', fontSize: 13 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontSize: 13, color: 'var(--fp-text)' }}>{m.email}</div>
                            {m.phone && <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2 }}>{m.phone}</div>}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            {(() => {
                              const styles = {
                                lead: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Lead' },
                                active: { bg: 'rgba(5,150,105,0.1)', color: '#059669', label: 'Active' },
                                inactive: { bg: 'rgba(156,163,175,0.1)', color: '#6b7280', label: 'Inactive' },
                              };
                              const s = styles[m.status] || styles.lead;
                              return (
                                <span style={{ padding: '4px 12px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 12, fontWeight: 700 }}>
                                  {s.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(226,93,37,0.1)', color: '#E25D25', fontSize: 12, fontWeight: 700 }}>
                              {m.bookings.length}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <a href={`mailto:${m.email}`} onClick={e => e.stopPropagation()} title="Email" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--fp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fp-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fp-accent)'; e.currentTarget.style.color = 'var(--fp-accent)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--fp-border)'; e.currentTarget.style.color = 'var(--fp-muted)'; }}
                              ><Icon path={icons.mail} size={14} /></a>
                              {m.phone && (
                                <a href={`tel:${m.phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()} title="Call" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--fp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fp-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fp-accent)'; e.currentTarget.style.color = 'var(--fp-accent)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--fp-border)'; e.currentTarget.style.color = 'var(--fp-muted)'; }}
                                ><Icon path={icons.phone} size={14} /></a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Add Member Modal */}
            {showAddMemberModal && (
              <div className="modal-overlay" onClick={() => { setShowAddMemberModal(false); setNewMemberParent({ name: '', email: '', phone: '' }); setNewMemberChildren([{ name: '', grade: '' }]); }}>
                <div className="modal fp" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--fp-border)' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--fp-text)' }}>Add Member</div>
                    <button onClick={() => { setShowAddMemberModal(false); setNewMemberParent({ name: '', email: '', phone: '' }); setNewMemberChildren([{ name: '', grade: '' }]); }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid var(--fp-border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--fp-muted)' }}>\u2715</button>
                  </div>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent / Guardian</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>First Name</label>
                        <input value={newMemberParent.firstName || ''} onChange={e => setNewMemberParent(p => ({ ...p, firstName: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Last Name</label>
                        <input value={newMemberParent.lastName || ''} onChange={e => setNewMemberParent(p => ({ ...p, lastName: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Email</label>
                        <input type="email" value={newMemberParent.email} onChange={e => setNewMemberParent(p => ({ ...p, email: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Phone</label>
                        <input type="tel" value={newMemberParent.phone} onChange={e => setNewMemberParent(p => ({ ...p, phone: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                      </div>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Children</div>
                    {newMemberChildren.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          {i === 0 && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Name</label>}
                          <input value={c.name} onChange={e => setNewMemberChildren(prev => prev.map((ch, idx) => idx === i ? { ...ch, name: e.target.value } : ch))} placeholder="Child's name"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          {i === 0 && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Grade</label>}
                          <select value={c.grade || ''} onChange={e => setNewMemberChildren(prev => prev.map((ch, idx) => idx === i ? { ...ch, grade: e.target.value } : ch))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none', appearance: 'auto', cursor: 'pointer' }}>
                            <option value="">Select grade...</option>
                            {["Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Grade 13"].map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        {newMemberChildren.length > 1 && (
                          <button onClick={() => setNewMemberChildren(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ padding: '10px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>Remove</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setNewMemberChildren(prev => [...prev, { name: '', grade: '' }])}
                      style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--fp-border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fp-accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Add Child
                    </button>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => { setShowAddMemberModal(false); setNewMemberParent({ name: '', email: '', phone: '' }); setNewMemberChildren([{ name: '', grade: '' }]); }} className="btn btn-ghost fp" style={{ border: '1px solid var(--fp-border)' }}>Cancel</button>
                      <button className="btn btn-primary fp" disabled={addMemberSaving || !newMemberParent.firstName || !newMemberParent.email} onClick={async () => {
                        const fullName = `${(newMemberParent.firstName || '').trim()} ${(newMemberParent.lastName || '').trim()}`.trim();
                        const validChildren = newMemberChildren.filter(c => c.name.trim());
                        if (!fullName || !newMemberParent.email.trim()) { showToast('\u2717 Name and email are required.'); return; }
                        if (validChildren.length === 0) { showToast('\u2717 Add at least one child.'); return; }
                        setAddMemberSaving(true);
                        try {
                          const { collection, addDoc, getDocs, query, where } = await import('firebase/firestore');
                          const { db } = await import('./firebase.js');
                          await addDoc(collection(db, 'bookings'), {
                            locationId,
                            customerName: fullName,
                            customerEmail: newMemberParent.email.trim().toLowerCase(),
                            customerPhone: (newMemberParent.phone || '').trim(),
                            children: validChildren.map(c => ({ name: c.name.trim(), grade: c.grade || '' })),
                            status: 'lead',
                            type: 'manual',
                            source: 'manual_add',
                            date: new Date().toISOString().split('T')[0],
                            time: '00:00',
                            createdAt: new Date(),
                          });
                          showToast(`\u2713 ${fullName} added as a new member.`);
                          setShowAddMemberModal(false);
                          setNewMemberParent({ name: '', email: '', phone: '' });
                          setNewMemberChildren([{ name: '', grade: '' }]);
                          const q = query(collection(db, 'bookings'), where('locationId', '==', locationId));
                          const snap = await getDocs(q);
                          const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                          allBookings.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
                          setBookings(allBookings);
                        } catch (e) { console.error('Failed to add member:', e); showToast('\u2717 Failed to add member.'); }
                        setAddMemberSaving(false);
                      }}>
                        <Icon path={icons.check} size={14} /> {addMemberSaving ? 'Adding...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      {/* === PAYMENTS PAGE === */}
      {page === 'payments' && (
        <>
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="page-title" style={{ color: 'var(--fp-text)' }}>Payments</div>
              <div className="page-desc" style={{ color: 'var(--fp-muted)' }}>Manage memberships and sales for your centre.</div>
            </div>
            <button className="btn btn-primary fp" onClick={() => setShowNewSaleModal(true)}>
              <Icon path={icons.plus} size={14} /> New Sale
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>{sales.filter(s => s.status === 'active').length}</div>
              <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>Active Memberships</div>
            </div>
            <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>
                ${sales.filter(s => s.status === 'active').reduce((sum, s) => sum + (Number(s.weeklyAmount) || 0), 0).toFixed(0)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>Weekly Revenue</div>
            </div>
            <div className="card fp" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fp-accent)' }}>{sales.length}</div>
              <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 4 }}>Total Sales</div>
            </div>
          </div>

          {/* Sales Table */}
          {salesLoading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--fp-muted)' }}>Loading sales...</div>
          ) : sales.length === 0 ? (
            <div className="card fp" style={{ padding: 40, textAlign: 'center', color: 'var(--fp-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)' }}>No sales yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Create your first membership sale to get started.</div>
              <button className="btn btn-primary fp" style={{ marginTop: 16 }} onClick={() => setShowNewSaleModal(true)}>
                <Icon path={icons.plus} size={14} /> New Sale
              </button>
            </div>
          ) : (
            <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--fp-border)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Child</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Parent</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Membership</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Amount</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Start Date</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fp-muted)' }}>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => {
                    const fmtDate = (d) => { if (!d) return '—'; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); };
                    const hasPayment = s.stripeStatus === 'connected' || s.paymentMethod;
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--fp-border)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: '50%', overflow: 'hidden',
                              background: 'rgba(109,203,202,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fp-accent)' }}>
                                {(s.children?.[0]?.name || '?')[0]}
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: 'var(--fp-text)' }}>
                              {(s.children || []).map(c => c.name).join(', ') || '—'}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--fp-muted)', fontSize: 13 }}>
                          <div>{s.parentName || '—'}</div>
                          {s.parentEmail && <div style={{ marginTop: 2 }}>{s.parentEmail}</div>}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(109,203,202,0.12)', color: 'var(--fp-accent)', fontSize: 12, fontWeight: 600 }}>
                            {s.membershipName || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--fp-text)', fontSize: 14 }}>
                          ${Number(s.weeklyAmount || 0).toFixed(2)}<span style={{ fontWeight: 400, color: 'var(--fp-muted)', fontSize: 12 }}>/wk</span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--fp-muted)', fontSize: 13 }}>
                          {fmtDate(s.activationDate)}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {hasPayment ? (
                            <div>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#ecfdf5', color: '#059669' }}>
                                {s.paymentMethod?.brand} •••• {s.paymentMethod?.last4}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-ghost fp" style={{ padding: '5px 10px', fontSize: 11, border: '1px solid var(--fp-accent)', color: 'var(--fp-accent)' }}
                                onClick={async () => {
                                  setCardCollecting(s.id);
                                  try {
                                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                                    const fns = getFunctions();
                                    const createSetup = httpsCallable(fns, 'createSetupIntent');
                                    const result = await createSetup({ parentEmail: s.parentEmail, parentName: s.parentName, parentPhone: s.parentPhone, locationId, saleId: s.id });
                                    // Store setup intent data for the card form
                                    setCardCollecting({ saleId: s.id, clientSecret: result.data.clientSecret, customerId: result.data.customerId, stripeAccountId: result.data.stripeAccountId });
                                  } catch (e) {
                                    console.error('Setup intent error:', e);
                                    showToast('✗ ' + (e.message || 'Failed to set up card collection. Is Stripe connected?'));
                                    setCardCollecting(null);
                                  }
                                }}>
                                Collect Card
                              </button>
                              <button className="btn btn-ghost fp" style={{ padding: '5px 10px', fontSize: 11 }}
                                onClick={async () => {
                                  try {
                                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                                    const fns = getFunctions();
                                    const createLink = httpsCallable(fns, 'createPaymentLink');
                                    const result = await createLink({ saleId: s.id, locationId });
                                    // Copy link to clipboard
                                    await navigator.clipboard.writeText(result.data.url);
                                    showToast('✓ Payment link copied to clipboard. Send it to the parent.');
                                  } catch (e) {
                                    console.error('Payment link error:', e);
                                    showToast('✗ ' + (e.message || 'Failed to create payment link.'));
                                  }
                                }}>
                                Send Link
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Payment Transaction Logs */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--fp-text)' }}>Transaction Log</div>
                <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginTop: 2 }}>All processed payment transactions.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fp-muted)' }}>From</label>
                <input type="date" value={txLogStartDate} onChange={e => setTxLogStartDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 13, color: 'var(--fp-text)', outline: 'none' }} />
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fp-muted)' }}>To</label>
                <input type="date" value={txLogEndDate} onChange={e => setTxLogEndDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 13, color: 'var(--fp-text)', outline: 'none' }} />
              </div>
            </div>
            {(() => {
              const txLogs = sales.filter(s => s.paymentMethod || s.stripeStatus === 'connected').map(s => ({
                id: s.id,
                date: s.activationDate || s.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || '',
                parent: s.parentName,
                email: s.parentEmail,
                membership: s.membershipName,
                amount: s.weeklyAmount || 0,
                setupFee: s.setupFee || 0,
                method: s.paymentMethod ? `${s.paymentMethod.brand} •••• ${s.paymentMethod.last4}` : 'Pending',
                status: s.stripeStatus === 'connected' ? 'Processed' : 'Pending',
                children: (s.children || []).map(c => c.name).join(', '),
              })).filter(tx => {
                if (txLogStartDate && tx.date < txLogStartDate) return false;
                if (txLogEndDate && tx.date > txLogEndDate) return false;
                return true;
              }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

              if (txLogs.length === 0) {
                return (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--fp-muted)', background: 'var(--fp-bg)', borderRadius: 12, border: '1px dashed var(--fp-border)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>No transactions found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Processed payments will appear here.</div>
                  </div>
                );
              }

              return (
                <div className="card fp" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--fp-border)', background: 'var(--fp-bg)' }}>
                        {['Date', 'Parent', 'Membership', 'Child', 'Amount', 'Method', 'Status'].map(h => (
                          <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txLogs.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--fp-border)' }}>
                          <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--fp-text)' }}>{tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fp-text)' }}>{tx.parent}</div>
                            <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{tx.email}</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--fp-text)' }}>{tx.membership}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--fp-muted)' }}>{tx.children || '—'}</td>
                          <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: 'var(--fp-text)' }}>${Number(tx.amount).toFixed(2)}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--fp-muted)' }}>{tx.method}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: tx.status === 'Processed' ? '#ecfdf5' : '#fffbeb', color: tx.status === 'Processed' ? '#059669' : '#d97706' }}>{tx.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Card Collection Modal */}
          {cardCollecting && cardCollecting.clientSecret && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setCardCollecting(null)}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 8 }}>Collect Card Details</div>
                <div style={{ fontSize: 13, color: 'var(--fp-muted)', marginBottom: 20 }}>Enter the parent's card details below. The card will be saved for recurring payments.</div>

                <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                  <strong>Stripe Elements:</strong> To use the inline card form, you'll need to add the Stripe.js library to your HTML.
                  For now, use the "Send Link" button to send a Stripe-hosted payment page to the parent, or add the Stripe Elements integration after deploying the Cloud Functions.
                </div>

                <div style={{ padding: '16px', background: 'var(--fp-bg)', borderRadius: 10, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 8 }}>Setup Intent Client Secret (for Stripe Elements):</div>
                  <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--fp-text)' }}>{cardCollecting.clientSecret?.slice(0, 30)}...</code>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost fp" onClick={() => setCardCollecting(null)}>Close</button>
                  <button className="btn btn-primary fp" onClick={async () => {
                    try {
                      const { getFunctions, httpsCallable } = await import('firebase/functions');
                      const fns = getFunctions();
                      const confirm = httpsCallable(fns, 'confirmPaymentMethod');
                      const result = await confirm({ saleId: cardCollecting.saleId, customerId: cardCollecting.customerId, stripeAccountId: cardCollecting.stripeAccountId });
                      setSales(prev => prev.map(s => s.id === cardCollecting.saleId ? { ...s, paymentMethod: { brand: result.data.brand, last4: result.data.last4 }, stripeStatus: 'connected' } : s));
                      showToast(`✓ Card saved: ${result.data.brand} •••• ${result.data.last4}`);
                      setCardCollecting(null);
                    } catch (e) {
                      console.error('Confirm error:', e);
                      showToast('✗ Card not yet saved. Ask the parent to complete via payment link.');
                    }
                  }}>
                    Verify Card
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* New Sale Modal */}
          {showNewSaleModal && (() => {
            const enabledPricing = Object.entries(PRICING_OPTIONS).flatMap(([catKey, cat]) =>
              cat.items.filter(item => pricing[item.id]?.enabled).map(item => ({
                ...item,
                category: cat.label,
                price: pricing[item.id]?.price || '',
              }))
            );

            const NewSaleForm = () => {
              const [saleChildren, setSaleChildren] = useState([]);
              const [childSearch, setChildSearch] = useState('');
              const [showChildDrop, setShowChildDrop] = useState(false);
              const [selectedMembership, setSelectedMembership] = useState('');
              const [activationDate, setActivationDate] = useState(new Date().toISOString().split('T')[0]);
              const [firstPaymentDate, setFirstPaymentDate] = useState(new Date().toISOString().split('T')[0]);
              const [setupFee, setSetupFee] = useState('99');
              const [discountType, setDiscountType] = useState('none'); // 'none', 'fixed', 'percent'
              const [discountValue, setDiscountValue] = useState('');

              const allKids = [];
              members.forEach(m => {
                (m.children || []).forEach(c => {
                  allKids.push({ name: c.name, grade: c.grade || '', parentName: m.name, parentEmail: m.email, parentPhone: m.phone });
                });
              });

              const chosenMembership = enabledPricing.find(p => p.id === selectedMembership);
              const basePrice = chosenMembership ? Number(chosenMembership.price) || 0 : 0;
              let finalPrice = basePrice;
              if (discountType === 'fixed') finalPrice = Math.max(0, basePrice - (Number(discountValue) || 0));
              if (discountType === 'percent') finalPrice = Math.max(0, basePrice * (1 - (Number(discountValue) || 0) / 100));

              const inputStyle2 = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid var(--fp-border)', background: '#fff', fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', outline: 'none', boxSizing: 'border-box' };
              const selectStyle2 = { ...inputStyle2, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7280%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px', paddingRight: 36 };
              const lblStyle = { fontSize: 13, fontWeight: 700, color: 'var(--fp-text)', marginBottom: 6, display: 'block' };

              const handleProcessSale = async () => {
                if (!saleChildren.length || !selectedMembership || !activationDate || !firstPaymentDate) return;

                // Check if parent has payment method on file
                const parentEmail = saleChildren[0]?.parentEmail || '';
                const parentMember = members.find(m => m.email?.toLowerCase() === parentEmail.toLowerCase());
                const hasPaymentMethod = parentMember?.paymentMethod || parentMember?.stripeCustomerId;

                if (!hasPaymentMethod) {
                  // Save sale with pending payment status
                  setSaleSaving(true);
                  try {
                    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                    const { db } = await import('./firebase.js');
                    const saleData = {
                      locationId,
                      children: saleChildren,
                      parentName: saleChildren[0]?.parentName || '',
                      parentEmail: parentEmail,
                      parentPhone: saleChildren[0]?.parentPhone || '',
                      membershipId: selectedMembership,
                      membershipName: chosenMembership?.name || '',
                      membershipCategory: chosenMembership?.category || '',
                      basePrice,
                      discountType,
                      discountValue: Number(discountValue) || 0,
                      weeklyAmount: finalPrice,
                      setupFee: Number(setupFee) || 0,
                      activationDate,
                      firstPaymentDate,
                      billingFrequency: 'weekly',
                      status: 'active',
                      stripeStatus: 'requires_payment_method',
                      paymentMethod: null,
                      createdAt: serverTimestamp(),
                    };
                    const ref = await addDoc(collection(db, 'sales'), saleData);
                    setSales(prev => [{ id: ref.id, ...saleData, createdAt: new Date() }, ...prev]);
                    showToast('⚠ Sale saved — payment method required. A payment link will be sent to the parent once Stripe is connected.');
                    setShowNewSaleModal(false);
                  } catch (e) {
                    console.error('Failed to process sale:', e);
                    showToast('✗ Failed to process sale.');
                  }
                  setSaleSaving(false);
                  return;
                }

                // Has payment method — process normally
                setSaleSaving(true);
                try {
                  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                  const { db } = await import('./firebase.js');
                  const saleData = {
                    locationId,
                    children: saleChildren,
                    parentName: saleChildren[0]?.parentName || '',
                    parentEmail: parentEmail,
                    parentPhone: saleChildren[0]?.parentPhone || '',
                    membershipId: selectedMembership,
                    membershipName: chosenMembership?.name || '',
                    membershipCategory: chosenMembership?.category || '',
                    basePrice,
                    discountType,
                    discountValue: Number(discountValue) || 0,
                    weeklyAmount: finalPrice,
                    setupFee: Number(setupFee) || 0,
                    activationDate,
                    firstPaymentDate,
                    billingFrequency: 'weekly',
                    status: 'active',
                    stripeStatus: 'pending',
                    createdAt: serverTimestamp(),
                  };
                  const ref = await addDoc(collection(db, 'sales'), saleData);
                  setSales(prev => [{ id: ref.id, ...saleData, createdAt: new Date() }, ...prev]);
                  showToast('✓ Sale processed successfully.');
                  setShowNewSaleModal(false);
                } catch (e) {
                  console.error('Failed to process sale:', e);
                  showToast('✗ Failed to process sale.');
                }
                setSaleSaving(false);
              };

              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}
                  onClick={() => setShowNewSaleModal(false)}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 520, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--fp-text)', marginBottom: 24 }}>New Sale</div>

                    {/* Step 1: Select Children */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={lblStyle}>Children *</label>
                      <div style={{ position: 'relative' }}>
                        <input type="text" placeholder="Search children..." value={childSearch}
                          onChange={e => { setChildSearch(e.target.value); setShowChildDrop(true); }}
                          onFocus={() => { if (childSearch) setShowChildDrop(true); }}
                          style={inputStyle2} />
                        {showChildDrop && childSearch && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--fp-border)', borderRadius: 10, marginTop: 4, zIndex: 10, maxHeight: 150, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                            {(() => {
                              const term = childSearch.toLowerCase();
                              const filtered = allKids.filter(c =>
                                !saleChildren.some(sc => sc.name.toLowerCase() === c.name.toLowerCase() && sc.parentEmail === c.parentEmail) &&
                                (c.name.toLowerCase().includes(term) || c.parentName.toLowerCase().includes(term))
                              );
                              if (!filtered.length) return <div style={{ padding: 12, fontSize: 12, color: 'var(--fp-muted)', textAlign: 'center' }}>No matching children.</div>;
                              return filtered.slice(0, 8).map((c, i) => (
                                <div key={i} onClick={() => {
                                  setSaleChildren(prev => [...prev, c]);
                                  setChildSearch(''); setShowChildDrop(false);
                                }} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--fp-bg)'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{c.grade ? `${c.grade} · ` : ''}{c.parentName}</div>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                      {saleChildren.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {saleChildren.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(109,203,202,0.1)', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                              {c.name}
                              <button onClick={() => setSaleChildren(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: 0, fontFamily: 'inherit' }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Payment method check */}
                    {saleChildren.length > 0 && (() => {
                      const pEmail = saleChildren[0]?.parentEmail || '';
                      const pMember = members.find(m => m.email?.toLowerCase() === pEmail.toLowerCase());
                      const hasPm = pMember?.paymentMethod || pMember?.stripeCustomerId;
                      if (hasPm) return null;
                      return (
                        <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>No payment method on file</div>
                            <div style={{ fontSize: 12, color: '#a16207', marginTop: 2, lineHeight: 1.5 }}>
                              {saleChildren[0]?.parentName || 'This parent'} has no payment details connected.
                              The sale will be saved but payments won't be processed until Stripe is connected in Phase 2.
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 2: Select Membership */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={lblStyle}>Membership *</label>
                      {enabledPricing.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#E25D25', padding: '10px 14px', background: '#fef2f2', borderRadius: 8 }}>No pricing options enabled. Go to Settings to enable memberships.</div>
                      ) : (
                        <select value={selectedMembership} onChange={e => setSelectedMembership(e.target.value)} style={selectStyle2}>
                          <option value="">Select membership...</option>
                          {enabledPricing.map(p => (
                            <option key={p.id} value={p.id}>{p.name} — ${Number(p.price).toFixed(2)}/wk</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Step 3 & 4: Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <label style={lblStyle}>Activation Date *</label>
                        <input type="date" value={activationDate} onChange={e => setActivationDate(e.target.value)} style={inputStyle2} />
                      </div>
                      <div>
                        <label style={lblStyle}>First Payment Date *</label>
                        <input type="date" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} style={inputStyle2} />
                      </div>
                    </div>

                    {/* Step 5: Setup Fee */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={lblStyle}>One-Time Setup Fee</label>
                      <div style={{ display: 'flex', alignItems: 'center', border: '2px solid var(--fp-border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <span style={{ padding: '11px 10px', color: 'var(--fp-muted)', fontWeight: 700, fontSize: 14 }}>$</span>
                        <input type="number" min="0" step="0.01" value={setupFee} onChange={e => setSetupFee(e.target.value)}
                          style={{ flex: 1, padding: '11px 14px 11px 0', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', background: 'transparent' }} />
                      </div>
                    </div>

                    {/* Step 6: Discount */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={lblStyle}>Discount</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ val: 'none', label: 'None' }, { val: 'fixed', label: '$ Fixed' }, { val: 'percent', label: '% Off' }].map(opt => (
                          <button key={opt.val} onClick={() => { setDiscountType(opt.val); setDiscountValue(''); }} style={{
                            flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                            border: discountType === opt.val ? '2px solid var(--fp-accent)' : '1px solid var(--fp-border)',
                            background: discountType === opt.val ? 'rgba(109,203,202,0.08)' : '#fff',
                            color: discountType === opt.val ? 'var(--fp-accent)' : 'var(--fp-muted)',
                          }}>{opt.label}</button>
                        ))}
                      </div>
                      {discountType !== 'none' && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', border: '2px solid var(--fp-border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                          <span style={{ padding: '11px 10px', color: 'var(--fp-muted)', fontWeight: 700, fontSize: 14 }}>{discountType === 'fixed' ? '$' : '%'}</span>
                          <input type="number" min="0" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                            placeholder={discountType === 'fixed' ? 'Amount off' : 'Percentage off'}
                            style={{ flex: 1, padding: '11px 14px 11px 0', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, color: 'var(--fp-text)', background: 'transparent' }} />
                        </div>
                      )}
                    </div>

                    {/* Price summary */}
                    {selectedMembership && (
                      <div style={{ padding: '16px', background: 'var(--fp-bg)', borderRadius: 10, marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--fp-muted)' }}>
                          <span>Base price</span>
                          <span>${basePrice.toFixed(2)}/wk</span>
                        </div>
                        {discountType !== 'none' && discountValue && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#dc2626' }}>
                            <span>Discount ({discountType === 'fixed' ? `$${discountValue}` : `${discountValue}%`})</span>
                            <span>-${(basePrice - finalPrice).toFixed(2)}/wk</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: 'var(--fp-text)', borderTop: '1px solid var(--fp-border)', paddingTop: 8 }}>
                          <span>Weekly total</span>
                          <span>${finalPrice.toFixed(2)}/wk</span>
                        </div>
                        {Number(setupFee) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: 'var(--fp-muted)' }}>
                            <span>Setup fee (one-time)</span>
                            <span>${Number(setupFee).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost fp" onClick={() => setShowNewSaleModal(false)}>Cancel</button>
                      <button className="btn btn-primary fp" onClick={handleProcessSale}
                        disabled={saleSaving || !saleChildren.length || !selectedMembership || !activationDate || !firstPaymentDate}
                        style={{ opacity: (saleSaving || !saleChildren.length || !selectedMembership) ? 0.5 : 1 }}>
                        {saleSaving ? 'Processing...' : 'Process Sale'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            };
            return <NewSaleForm />;
          })()}
        </>
      )}

      </main>

      {/* Member Detail Modal */}
      {selectedMember && (
        <div className="modal-overlay" onClick={() => { setSelectedMember(null); setEditingMember(null); }}>
          <div className="modal fp" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header fp" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="modal-title fp">{selectedMember.name}</div>
              <button className="modal-close" onClick={() => { setSelectedMember(null); setEditingMember(null); }} style={{ marginLeft: 'auto' }}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--fp-border)' }}>
              {[
                { key: 'profile', icon: icons.users, label: 'Profile' },
                { key: 'timetable', icon: icons.calendar, label: 'Timetable' },
                { key: 'payments', icon: icons.settings, label: 'Payments' },
              ].map(t => (
                <button key={t.key} onClick={() => setMemberTab(t.key)} title={t.label}
                  style={{
                    flex: 1, padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'none', border: 'none', borderBottom: memberTab === t.key ? '2px solid var(--fp-accent)' : '2px solid transparent',
                    color: memberTab === t.key ? 'var(--fp-accent)' : 'var(--fp-muted)',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon path={t.icon} size={15} /> {t.label}
                </button>
              ))}
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              {/* Profile Tab */}
              {memberTab === 'profile' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Edit / View toggle */}
                  {!editingMember ? (
                    <>
                      {/* View mode */}
                      {[
                        { icon: icons.mail, label: 'Email', value: selectedMember.email, href: `mailto:${selectedMember.email}` },
                        { icon: icons.phone, label: 'Phone', value: selectedMember.phone || '—', href: selectedMember.phone ? `tel:${selectedMember.phone.replace(/\s/g, '')}` : null },
                      ].map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--fp-bg)', borderRadius: 8 }}>
                          <Icon path={row.icon} size={15} style={{ color: 'var(--fp-accent)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--fp-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{row.label}</div>
                            {row.href ? (
                              <a href={row.href} style={{ fontSize: 14, color: 'var(--fp-text)', textDecoration: 'none', fontWeight: 600 }}>{row.value}</a>
                            ) : (
                              <div style={{ fontSize: 14, color: 'var(--fp-text)', fontWeight: 600 }}>{row.value}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {selectedMember.children.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Children</div>
                          {selectedMember.children.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--fp-bg)', borderRadius: 8, marginBottom: 6 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(109,203,202,0.15)', color: 'var(--fp-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{c.name?.[0] || '?'}</div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fp-text)' }}>{c.name}</div>
                                {c.grade && <div style={{ fontSize: 12, color: 'var(--fp-muted)' }}>{c.grade}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setEditingMember({
                          parentFirstName: selectedMember.parentFirstName || selectedMember.name?.split(' ')[0] || '',
                          parentLastName: selectedMember.parentLastName || selectedMember.name?.split(' ').slice(1).join(' ') || '',
                          email: selectedMember.email,
                          phone: selectedMember.phone || '',
                          children: selectedMember.children.length > 0 ? [...selectedMember.children] : [{ name: '', grade: '' }],
                        })}
                        className="btn btn-ghost fp"
                        style={{ alignSelf: 'flex-start', border: '1px solid var(--fp-border)', marginTop: 4 }}
                      >
                        <Icon path={icons.edit} size={14} /> Edit Profile
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Edit mode */}
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent / Guardian</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>First Name</label>
                          <input value={editingMember.parentFirstName} onChange={e => setEditingMember({ ...editingMember, parentFirstName: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Last Name</label>
                          <input value={editingMember.parentLastName} onChange={e => setEditingMember({ ...editingMember, parentLastName: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Email</label>
                          <input type="email" value={editingMember.email} onChange={e => setEditingMember({ ...editingMember, email: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Phone</label>
                          <input type="tel" value={editingMember.phone} onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                        </div>
                      </div>

                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Children</div>
                      {editingMember.children.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            {i === 0 && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Name</label>}
                            <input value={c.name} onChange={e => {
                              const updated = [...editingMember.children];
                              updated[i] = { ...updated[i], name: e.target.value };
                              setEditingMember({ ...editingMember, children: updated });
                            }} placeholder="Child's name"
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            {i === 0 && <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Grade</label>}
                            <select value={c.grade || ''} onChange={e => {
                              const updated = [...editingMember.children];
                              updated[i] = { ...updated[i], grade: e.target.value };
                              setEditingMember({ ...editingMember, children: updated });
                            }}
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid var(--fp-border)', fontFamily: 'inherit', fontSize: 14, outline: 'none', appearance: 'auto', cursor: 'pointer' }}>
                              <option value="">Select grade...</option>
                              {["Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Grade 13"].map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                          {editingMember.children.length > 1 && (
                            <button onClick={() => {
                              setEditingMember({ ...editingMember, children: editingMember.children.filter((_, idx) => idx !== i) });
                            }} style={{ padding: '10px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>Remove</button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setEditingMember({ ...editingMember, children: [...editingMember.children, { name: '', grade: '' }] })}
                        style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--fp-border)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--fp-accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add Child
                      </button>

                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => setEditingMember(null)} className="btn btn-ghost fp" style={{ border: '1px solid var(--fp-border)' }}>Cancel</button>
                        <button onClick={() => saveMemberProfile(editingMember)} className="btn btn-primary fp" disabled={memberSaving || !editingMember.parentFirstName || !editingMember.email}>
                          <Icon path={icons.check} size={14} /> {memberSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Timetable Tab */}
              {memberTab === 'timetable' && (
                <div>
                  {selectedMember.bookings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--fp-muted)' }}>No bookings found</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedMember.bookings
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((b, i) => {
                          const dateObj = new Date(b.date + 'T00:00:00');
                          const [h, m] = (b.time || '00:00').split(':').map(Number);
                          const isPast = new Date(b.date) < new Date(new Date().toISOString().split('T')[0]);
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--fp-bg)', borderRadius: 8, opacity: isPast ? 0.6 : 1 }}>
                              <div style={{ width: 40, height: 40, borderRadius: 10, background: isPast ? 'rgba(156,163,175,0.1)' : 'rgba(109,203,202,0.12)', color: isPast ? 'var(--fp-muted)' : 'var(--fp-accent)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{dateObj.getDate()}</div>
                                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>{dateObj.toLocaleDateString('en-AU', { month: 'short' })}</div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--fp-text)' }}>
                                  {dateObj.toLocaleDateString('en-AU', { weekday: 'long' })}
                                  {isPast && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--fp-muted)', fontWeight: 600 }}>Past</span>}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--fp-muted)' }}>
                                  {h > 12 ? h - 12 : h}:{String(m).padStart(2, '0')} {h >= 12 ? 'PM' : 'AM'} — {b.duration || 40} min
                                </div>
                              </div>
                              <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: b.status === 'confirmed' ? 'rgba(5,150,105,0.1)' : 'rgba(226,93,37,0.1)', color: b.status === 'confirmed' ? '#059669' : '#E25D25' }}>
                                {b.status || 'confirmed'}
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Payments Tab */}
              {memberTab === 'payments' && (
                <div style={{ padding: '8px 0' }}>
                  {(() => {
                    const memberPayment = selectedMember?.paymentMethod || 
                      sales.find(s => s.parentEmail?.toLowerCase() === selectedMember?.email?.toLowerCase() && s.paymentMethod)?.paymentMethod || null;
                    const memberStripeCustomerId = selectedMember?.stripeCustomerId ||
                      sales.find(s => s.parentEmail?.toLowerCase() === selectedMember?.email?.toLowerCase() && s.stripeCustomerId)?.stripeCustomerId || null;

                    return (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--fp-text)', marginBottom: 4 }}>Payment Method</div>
                        <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 20 }}>
                          {memberPayment ? 'Payment method on file for this parent. Used for all memberships.' : 'No payment method on file for this parent.'}
                        </div>

                        {memberPayment ? (
                          <div>
                            {/* Payment method display */}
                            <div style={{ padding: '20px', background: memberPayment.type === 'au_becs_debit' ? 'linear-gradient(135deg, #0f3443 0%, #34e89e 100%)' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', borderRadius: 14, color: '#fff', marginBottom: 16 }}>
                              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                {memberPayment.type === 'au_becs_debit' ? 'Bank account on file' : 'Card on file'}
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 16 }}>
                                •••• •••• •••• {memberPayment.last4}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                {memberPayment.type === 'au_becs_debit' ? (
                                  <div>
                                    <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase' }}>Type</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>Direct Debit</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase' }}>Expires</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{String(memberPayment.expMonth || '').padStart(2, '0')}/{memberPayment.expYear || ''}</div>
                                  </div>
                                )}
                                <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase' }}>{memberPayment.brand}</div>
                              </div>
                            </div>

                            {/* Replace payment method button */}
                            <button className="btn btn-ghost fp" style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
                              onClick={async () => {
                                try {
                                  const { getFunctions, httpsCallable } = await import('firebase/functions');
                                  const fns = getFunctions();
                                  const createLink = httpsCallable(fns, 'createPaymentLink');
                                  // Find a sale for this parent to associate the checkout session
                                  const parentSale = sales.find(s => s.parentEmail?.toLowerCase() === selectedMember.email?.toLowerCase());
                                  const result = await createLink({ saleId: parentSale?.id || 'none', locationId });
                                  window.open(result.data.url, '_blank');
                                  showToast('Stripe checkout opened. The parent can enter new card details.');
                                } catch (e) {
                                  console.error('Payment link error:', e);
                                  showToast('✗ Failed to open payment form. Is Stripe connected?');
                                }
                              }}>
                              <Icon path={icons.edit} size={13} /> Replace Payment Method
                            </button>
                          </div>
                        ) : (
                          <div>
                            {/* No card — collect with inline form */}
                            {!cardFormState ? (
                              <div style={{ padding: '32px', textAlign: 'center', background: 'var(--fp-bg)', borderRadius: 12, border: '1px dashed var(--fp-border)' }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fp-text)', marginBottom: 4 }}>No payment method on file</div>
                                <div style={{ fontSize: 12, color: 'var(--fp-muted)', marginBottom: 16 }}>Add a card or bank account to enable recurring billing.</div>
                                <button className="btn btn-primary fp" onClick={async () => {
                                  try {
                                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                                    const fns = getFunctions();
                                    const createSetup = httpsCallable(fns, 'createSetupIntent');
                                    const result = await createSetup({ parentEmail: selectedMember.email, parentName: selectedMember.name, parentPhone: selectedMember.phone, locationId, saleId: '' });
                                    setCardFormState({ clientSecret: result.data.clientSecret, stripeAccountId: result.data.stripeAccountId, customerId: result.data.customerId });
                                  } catch (e) {
                                    console.error('Setup intent error:', e);
                                    showToast('✗ Failed to initialize card form. Is Stripe connected in Settings?');
                                  }
                                }}>
                                  <Icon path={icons.creditCard} size={14} /> Add Payment Method
                                </button>
                              </div>
                            ) : (
                              <div style={{ background: '#fff', borderRadius: 12, border: '2px solid var(--fp-border)', padding: 20 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fp-text)', marginBottom: 16 }}>Enter Card Details</div>
                                <div id="stripe-card-element" ref={el => {
                                  if (el && !el.dataset.mounted && cardFormState?.clientSecret) {
                                    el.dataset.mounted = 'true';
                                    try {
                                      const stripeInstance = window.Stripe(
                                        'pk_test_51T5SUvLsPU0tzh4WBBfeISFfSFTLC0rD2c7fuB9h3ePAToMm0levx9XYwQ2yqIDxwswTVmcX9EaTHqhUOuL38d0Y00DHJQZK6H',
                                        { stripeAccount: cardFormState.stripeAccountId }
                                      );
                                      const elements = stripeInstance.elements({ clientSecret: cardFormState.clientSecret });
                                      const paymentElement = elements.create('payment');
                                      paymentElement.mount(el);
                                      // Store on the element for later use
                                      el._stripe = stripeInstance;
                                      el._elements = elements;
                                    } catch (err) { console.error('Stripe mount error:', err); }
                                  }
                                }} style={{ minHeight: 120, marginBottom: 16 }} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button className="btn btn-ghost fp" onClick={() => setCardFormState(null)}>Cancel</button>
                                  <button className="btn btn-primary fp" disabled={cardFormSaving} style={{ flex: 1 }} onClick={async () => {
                                    const el = document.getElementById('stripe-card-element');
                                    if (!el?._stripe || !el?._elements) { showToast('✗ Card form not ready.'); return; }
                                    setCardFormSaving(true);
                                    try {
                                      const { error } = await el._stripe.confirmSetup({
                                        elements: el._elements,
                                        confirmParams: { return_url: window.location.origin + '?payment_setup=success&sale_id=' + (sales.find(s => s.parentEmail?.toLowerCase() === selectedMember.email?.toLowerCase())?.id || 'none') },
                                        redirect: 'if_required',
                                      });
                                      if (error) {
                                        showToast('✗ ' + error.message);
                                        setCardFormSaving(false);
                                        return;
                                      }
                                      // Success — save payment to Firestore
                                      const { getFunctions, httpsCallable } = await import('firebase/functions');
                                      const fns = getFunctions();
                                      const savePayment = httpsCallable(fns, 'savePaymentFromCheckout');
                                      const result = await savePayment({ parentEmail: selectedMember.email, locationId });
                                      showToast(`✓ ${result.data.brand} •••• ${result.data.last4} saved!`);
                                      setCardFormState(null);
                                      // Refresh sales
                                      const { collection, getDocs, query, where } = await import('firebase/firestore');
                                      const { db } = await import('./firebase.js');
                                      const q = query(collection(db, 'sales'), where('locationId', '==', locationId));
                                      const snap = await getDocs(q);
                                      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                                      // Update selected member
                                      setSelectedMember(prev => ({ ...prev, paymentMethod: result.data }));
                                    } catch (e) {
                                      console.error('Save card error:', e);
                                      showToast('✗ ' + (e.message || 'Failed to save card.'));
                                    }
                                    setCardFormSaving(false);
                                  }}>
                                    {cardFormSaving ? 'Saving...' : 'Save Payment Method'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Active memberships for this parent */}
                        {(() => {
                          const parentSales = sales.filter(s => s.parentEmail?.toLowerCase() === selectedMember?.email?.toLowerCase());
                          if (!parentSales.length) return null;
                          return (
                            <div style={{ marginTop: 20 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--fp-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Active Memberships</div>
                              {parentSales.map(s => (
                                <div key={s.id} style={{ padding: '12px 14px', background: 'var(--fp-bg)', borderRadius: 10, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fp-text)' }}>{s.membershipName}</div>
                                    <div style={{ fontSize: 11, color: 'var(--fp-muted)' }}>{(s.children || []).map(c => c.name).join(', ')}</div>
                                  </div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fp-text)' }}>${Number(s.weeklyAmount || 0).toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--fp-muted)' }}>/wk</span></div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="modal fp" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header fp" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="modal-title fp">{selectedBooking?.type === 'session' ? 'Session Details' : 'Booking Details'}</div>
              <button className="modal-close" onClick={() => setSelectedBooking(null)} style={{ marginLeft: 'auto' }}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              {(() => {
                const b = selectedBooking;
                const dateObj = new Date(b.date + 'T00:00:00');
                const dateLabel = dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const timeLabel = fmtTime(b.time);
                const [bh, bm] = b.time.split(':').map(Number);
                // Duration: use stored duration, or look up from service, or fallback to 40 min
                const svcMatch = b.serviceId ? locationServices.find(s => s.id === b.serviceId) : null;
                const duration = b.duration ? Number(b.duration) : (svcMatch?.duration ? Number(svcMatch.duration) : 40);
                const endMin = bh * 60 + bm + duration;
                const endLabel = fmtTime(`${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`);
                const refCode = b.id.slice(0, 8).toUpperCase();
                const serviceName = b.serviceName || svcMatch?.name || '';
                const isSession = b.type === 'session';

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 12, background: isSession ? 'linear-gradient(135deg, #3d9695, #6DCBCA)' : 'linear-gradient(135deg, #E25D25, #f0845a)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{dateObj.getDate()}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{dateObj.toLocaleDateString('en-AU', { month: 'short' })}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--fp-text)' }}>{isSession ? (serviceName || 'Session') : b.customerName}</div>
                        <div style={{ fontSize: 13, color: 'var(--fp-muted)' }}>{dateLabel}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                      {serviceName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--fp-bg)', borderRadius: 8 }}>
                          <Icon path={icons.star} size={15} style={{ color: 'var(--fp-accent)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--fp-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service</div>
                            <div style={{ fontSize: 14, color: 'var(--fp-text)', fontWeight: 600 }}>{serviceName}</div>
                          </div>
                        </div>
                      )}
                      {[
                        { icon: icons.clock, label: 'Time', value: `${timeLabel} — ${endLabel} (${duration} min)` },
                        ...(isSession ? [
                          { icon: icons.users, label: 'Tutor', value: b.tutorName || '—' },
                          { icon: icons.calendar, label: 'Session Type', value: b.sessionType === 'recurring' ? 'Recurring' : 'One Off' },
                        ] : [
                          { icon: icons.mail, label: 'Email', value: b.customerEmail, href: `mailto:${b.customerEmail}` },
                          { icon: icons.phone, label: 'Phone', value: b.customerPhone, href: `tel:${b.customerPhone?.replace(/\s/g, '')}` },
                        ]),
                      ].map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--fp-bg)', borderRadius: 8 }}>
                          <Icon path={row.icon} size={15} style={{ color: 'var(--fp-accent)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'var(--fp-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{row.label}</div>
                            {row.href ? (
                              <a href={row.href} style={{ fontSize: 14, color: 'var(--fp-text)', textDecoration: 'none', fontWeight: 600 }}>{row.value}</a>
                            ) : (
                              <div style={{ fontSize: 14, color: 'var(--fp-text)', fontWeight: 600 }}>{row.value}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {b.notes && (
                        <div style={{ padding: '10px 14px', background: 'var(--fp-bg)', borderRadius: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--fp-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 14, color: 'var(--fp-text)' }}>{b.notes}</div>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--fp-muted)', textAlign: 'center' }}>Ref: {refCode}</div>

                    {/* Students & Attendance (sessions only) */}
                    {isSession && (
                      <SessionStudents bookingId={b.id} members={members} />
                    )}

                    {isSession ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        <div style={{
                          textAlign: 'center', padding: '10px 16px', borderRadius: 10,
                          background: b.status === 'completed' ? '#ecfdf5' : b.status === 'cancelled' ? '#fef2f2' : 'rgba(109,203,202,0.1)',
                          color: b.status === 'completed' ? '#059669' : b.status === 'cancelled' ? '#dc2626' : 'var(--fp-accent)',
                          fontWeight: 700, fontSize: 13, textTransform: 'capitalize',
                        }}>
                          Status: {b.status || 'Scheduled'}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary fp" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                            setSelectedBooking(null);
                            setSessionModal({ date: b.date, hour: Number(b.time.split(':')[0]), editing: b });
                          }}>
                            <Icon path={icons.edit} size={14} /> Edit Session
                          </button>
                          <button className="btn btn-ghost fp" style={{ flex: 1, justifyContent: 'center', color: '#dc2626', border: '1px solid #fecaca' }} onClick={() => {
                            setSelectedBooking(null);
                            setSessionDeleteConfirm(b);
                          }}>
                            <Icon path={icons.trash} size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <a href={`mailto:${b.customerEmail}`} className="btn btn-primary fp" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', justifyContent: 'center' }}>
                          <Icon path={icons.mail} size={14} /> Email Customer
                        </a>
                        <a href={`tel:${b.customerPhone?.replace(/\s/g, '')}`} className="btn btn-ghost fp" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', justifyContent: 'center', border: '1px solid var(--fp-border)' }}>
                          <Icon path={icons.phone} size={14} /> Call
                        </a>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast hq toast-success" style={{ background: '#fff', border: '1px solid var(--fp-border)', color: 'var(--fp-text)' }}>
          <span className="toast-icon"><Icon path={icons.check} size={16} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}
