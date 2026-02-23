# Architecture

## Technology Stack

| Layer          | Technology                                  |
| -------------- | ------------------------------------------- |
| Frontend       | React 19, Vite 7.3                          |
| Styling        | Vanilla CSS (inline + CSS custom properties)|
| Backend        | Firebase (Auth, Firestore, Cloud Functions) |
| Email          | SendGrid                                    |
| Maps           | Google Maps JavaScript API, Places, Geocoding |
| CI/CD          | GitHub Actions                              |
| Hosting        | Firebase Hosting                            |

No CSS framework (Bootstrap, Tailwind, etc.) or component library (MUI, Ant Design) is used. All UI is custom-built.

---

## Folder Structure

```
franchise-portal-test/
├── .github/
│   └── workflows/
│       ├── firebase-hosting-merge.yml      # Deploy on push to main
│       └── firebase-hosting-pull-request.yml # Preview deploy on PR
├── functions/
│   ├── index.js              # Cloud Functions (SendGrid emails)
│   ├── package.json          # Functions dependencies
│   └── package-lock.json
├── public/
│   ├── logo-sticker.png      # Logo asset
│   └── vite.svg              # Vite favicon
├── src/
│   ├── main.jsx              # Entry point & URL-based routing
│   ├── App.jsx               # Main portal app (HQ + Franchise)
│   ├── App.css               # Minimal template styles
│   ├── BookAssessment.jsx    # Public booking flow (3-step wizard)
│   ├── FindACentre.jsx       # Public location finder with map
│   ├── firebase.js           # Firebase SDK initialization
│   ├── index.css             # Base/reset styles
│   ├── hooks/
│   │   └── useAuth.js        # Auth hook (Google Sign-In + TOTP MFA)
│   └── services/
│       └── firestore.js      # Firestore CRUD operations
├── .firebaserc               # Firebase project alias
├── firebase.json             # Hosting, Functions, Firestore config
├── firestore.rules           # Firestore security rules
├── firestore.indexes.json    # Composite indexes
├── eslint.config.js          # ESLint configuration
├── vite.config.js            # Vite build configuration
├── index.html                # HTML shell (loads Google Maps SDK)
└── package.json              # Project dependencies & scripts
```

---

## Application Architecture

The application is a **single-page application (SPA)** with three distinct entry surfaces served from the same deployment:

```
index.html
  └── main.jsx (entry point)
        ├── /find-a-centre   →  FindACentre.jsx    (public)
        ├── /book-assessment  →  BookAssessment.jsx  (public)
        └── /* (default)      →  App.jsx             (authenticated)
                                   ├── PortalSelector
                                   ├── AuthPage
                                   ├── HQPortal
                                   └── FranchisePortal
```

### Routing

There is no router library (e.g., React Router). Routing is handled by a `window.location.pathname` check in `main.jsx`:

- `/find-a-centre` or `/find-a-center` renders `<FindACentre />`
- `/book-assessment` or `/book` renders `<BookAssessment />`
- All other paths render `<App />` (the authenticated portal)

Firebase Hosting rewrites all URLs to `/index.html` to support this SPA pattern.

---

## Component Hierarchy

### App.jsx (Authenticated Portal)

`App.jsx` is a monolithic file (~3,800 lines) containing all portal components. It manages two portals behind authentication:

```
App
├── PortalSelector          # Choose HQ or Franchise Partner portal
├── AuthPage                # Google Sign-In, role validation
├── HQPortal                # Admin interface
│   ├── Sidebar / TopBar
│   ├── LocationsPage       # CRUD for franchise locations
│   │   └── LocationModal   # Create/edit location form
│   ├── UsersPage           # HQ staff management
│   │   └── InviteUserModal # Invite new HQ user
│   ├── ServicesPage        # Service catalog management
│   │   └── ServiceModal    # Create/edit service
│   ├── SettingsPage        # Portal-wide settings
│   └── ConfirmModal        # Reusable delete/confirm dialog
└── FranchisePortal         # Partner interface
    ├── Availability/Timetable management
    └── Booking requests view
```

### FindACentre.jsx (Public)

Standalone component with Google Maps integration, marker clustering, geolocation, and address search.

### BookAssessment.jsx (Public)

Three-step wizard: location selection, date/time picker (reads availability from Firestore), and customer form submission.

---

## State Management

The app uses **React hooks only** -- no global state library (Redux, Zustand, Pinia, etc.) and no React Context API.

| Mechanism      | Usage                                            |
| -------------- | ------------------------------------------------ |
| `useState`     | All local component state (forms, modals, lists) |
| `useEffect`    | Data fetching, subscriptions, side effects       |
| `useRef`       | DOM references (map container, inputs)           |
| `useAuth` hook | Authentication state + TOTP MFA operations       |

### Data Flow

```
Firestore (source of truth)
    ↕  Direct reads/writes from components
React State (local)
    ↓  Props drilling
Child Components
```

- Components call Firestore directly via `src/services/firestore.js` or inline SDK calls.
- There is no intermediate state management layer, caching layer, or middleware.
- Parent components pass data to children via props.

---

## Data Models (Firestore Collections)

### `users/{uid}`
```
name: string
email: string
role: "master_admin" | "admin" | "franchise_partner"
locationId?: string          # Only for franchise_partner
jobTitle?: string            # Optional, for HQ staff
updatedAt: timestamp
```

### `locations/{locationId}`
```
name: string
address: string
phone: string
email: string
status: "open" | "coming_soon" | "temporary_closed"
lat?: number
lng?: number
createdAt: timestamp
updatedAt: timestamp
confirmationEmailSentAt?: string
```

### `availability/{locationId}`
```
schedule: [
  {
    day: string              # "Monday", "Tuesday", etc.
    enabled: boolean
    start: string            # "09:00"
    end: string              # "17:00"
    unavailable: [           # Blocked dates
      { date: "YYYY-MM-DD", reason: string }
    ]
  }
]
timezone: string             # e.g., "Australia/Sydney"
bufferMinutes: number        # 0-120
updatedAt: timestamp
```

### `bookings/{bookingId}`
```
locationId: string
locationName: string
locationAddress: string
date: string                 # "YYYY-MM-DD"
time: string                 # "HH:MM"
customerName: string
customerEmail: string
customerPhone: string
notes?: string
status: "confirmed" | "completed" | "cancelled"
createdAt: timestamp
emailsSentAt?: string
```

### `services/{serviceId}`
```
name: string
customName?: string          # If name is "Other"
description: string
duration: number             # Minutes
maxStudents: number
price?: number
imageUrl?: string            # Base64 or URL
countries: string[]
availability: string[]       # State/region names
createdAt: timestamp
updatedAt: timestamp
```

### `settings/{settingId}`
```
youtubeUrl?: string
updatedAt: timestamp
```

### `invites/{inviteId}`
```
name: string
email: string
jobTitle?: string
role: "admin"
status: "pending" | "accepted" | "declined"
createdAt: timestamp
```

---

## Authentication & Authorization

### Authentication Flow

1. User selects a portal (HQ or Franchise Partner).
2. Google OAuth 2.0 popup via Firebase Auth (`signInWithPopup`).
3. On success, the app checks for a matching `users/{uid}` document in Firestore.
   - **HQ users**: Must already exist (pre-created by a Master Admin).
   - **Franchise Partners**: Auto-created if their email matches a location's email.
4. The user's `role` is validated against the selected portal.
5. Optional TOTP MFA enrollment/verification via `useAuth` hook.

### Authorization Layers

| Layer              | Mechanism                                     |
| ------------------ | --------------------------------------------- |
| Firestore Rules    | Server-side enforcement (primary security)    |
| Component Guards   | Client-side role checks in `AuthPage`         |
| UI Conditionals    | Hide/show buttons based on role (cosmetic)    |
| Cloud Function Auth| `context.auth` checks in callable functions   |

### Roles

| Role               | Access                                        |
| ------------------ | --------------------------------------------- |
| `master_admin`     | Full HQ access: CRUD locations, users, services, settings, delete |
| `admin`            | HQ access: add/edit locations, services, settings (no delete, no user management) |
| `franchise_partner`| Partner portal only: manage own availability, view own bookings |

---

## External Services

| Service                  | Purpose                                    | Integration Point        |
| ------------------------ | ------------------------------------------ | ------------------------ |
| Firebase Auth            | Google OAuth 2.0 + TOTP MFA               | `src/hooks/useAuth.js`   |
| Cloud Firestore          | Database                                   | `src/services/firestore.js`, inline calls |
| Firebase Cloud Functions | Server-side email triggers                 | `functions/index.js`     |
| Firebase Hosting         | Static site hosting + CDN                  | `firebase.json`          |
| SendGrid                 | Transactional emails                       | `functions/index.js`     |
| Google Maps JS API       | Map display, marker clustering             | `index.html`, `FindACentre.jsx` |
| Google Places API        | Address autocomplete                       | `FindACentre.jsx`, `LocationModal` |
| Google Geocoding API     | Address to lat/lng conversion              | `FindACentre.jsx`, `LocationModal` |

---

## Cloud Functions

Four functions in `functions/index.js`:

| Function                  | Trigger                          | Action                                |
| ------------------------- | -------------------------------- | ------------------------------------- |
| `onLocationCreated`       | Firestore `locations` onCreate   | Sends welcome email to location       |
| `onBookingCreated`        | Firestore `bookings` onCreate    | Sends confirmation to customer + partner |
| `onInviteCreated`         | Firestore `invites` onCreate     | Sends invite email to new HQ user     |
| `resendConfirmationEmail` | HTTPS callable                   | Re-sends location confirmation email  |

All email functions use SendGrid. The API key is stored in Firebase Functions config (`functions.config().sendgrid.api_key`).

---

## Security

### Firestore Rules Summary

- **users**: Read own doc or if Master Admin; write restricted to Master Admin.
- **locations**: Read by admins (all) or franchise partner (own); write by admins with field validation; delete by Master Admin only.
- **availability**: Read/write by franchise partner for own location; admins can read all.
- **bookings**: Public create (anonymous); read/update by admins or location's franchise partner.
- **settings**: Public read; admin write.
- **services**: Public read; admin write.

### Hosting Headers

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

---

## Open Questions

1. **Monolithic App.jsx**: At ~3,800 lines, `App.jsx` contains all portal components. Is there a plan to split it into separate files/modules?
2. **Hardcoded Config**: Firebase config and the Google Maps API key are hardcoded in source files rather than using environment variables. Is this intentional for this test project, or should it be parameterized?
3. **No React Router**: The URL-based routing in `main.jsx` has no support for deep linking, query parameters, or navigation guards. Is a router library planned?
4. **No Global State**: With data fetched directly in components and passed via props, is there a plan to introduce Context API or a state library as complexity grows?
5. **Franchise Portal Completeness**: The franchise partner portal appears partially implemented. What additional features are planned?
6. **Testing**: There are no test files or testing dependencies. Is a testing strategy planned?
