# Features

## Portal Overview

The Franchise Portal is a multi-portal system for managing tutoring franchise locations, bookings, and services. It consists of three surfaces:

| Surface              | Audience             | Authentication |
| -------------------- | -------------------- | -------------- |
| HQ Portal            | Head office staff    | Required (Google + optional TOTP MFA) |
| Franchise Portal     | Franchise partners   | Required (Google + optional TOTP MFA) |
| Public Pages         | Customers            | None           |

---

## HQ Portal

Accessible to users with `master_admin` or `admin` roles.

### Locations Management

- **View all locations** in a sortable, filterable table.
- **Filter** by country, state/region, and status.
- **Create a new location** with:
  - Name, address (Google Places autocomplete), phone (with country code selector), email.
  - Status: open, coming soon, or temporarily closed.
  - Duplicate detection: warns if a location with the same name or address exists.
- **Edit existing locations** (name, address, phone, email, status).
- **Delete locations** (Master Admin only) with confirmation dialog.
- **Resend confirmation email** to a location's email address.
- **Automatic geocoding**: Address is converted to lat/lng for map display.

### Location Detail View

Click **"View"** on any location row to open a dedicated detail page with two tabs:

**Details Tab**
- Read-only overview of the location's information: name, status, address, phone, email, created date, and location ID.
- Quick-access Edit and Delete buttons in the header.

**User Logs Tab**
- Displays all user activity for that location, grouped by user.
- Each user card shows:
  - User avatar, name, and email.
  - **Last Sign In** timestamp in UTC.
  - **Last Activity** timestamp in UTC.
  - **Summary badge** — e.g. "3 sign-ins, 2 edits, 1 create".
- Click a user card to **expand** a detailed action log table with:
  - Timestamp (UTC).
  - Action type (color-coded badge: Sign In, Edit, Create, Delete, etc.).
  - Category (auth, location, etc.).
  - Human-readable description.
- **Filter by action type** (e.g. show only sign-ins or edits).
- **Summary stats** at the top: Active Users count, Total Actions count, most recent activity.

#### Events Currently Logged

| Event | Action | Category | Trigger |
|-------|--------|----------|---------|
| Franchise partner signs in | `sign_in` | `auth` | Google sign-in (AuthPage) |
| HQ user signs in | `sign_in` | `auth` | Google sign-in (AuthPage) |
| Location created | `create` | `location` | Create location (HQPortal) |
| Location edited | `edit` | `location` | Edit location (HQPortal) |
| Location deleted | `delete` | `location` | Delete location (HQPortal) |

### User Management (Master Admin Only)

- **View HQ users** in a table with role badges.
- **Invite new HQ users** by email:
  - Creates an `invites` document in Firestore.
  - Triggers a Cloud Function that sends an invite email via SendGrid.
  - Invite includes a link with `?invite={inviteId}` parameter.
- **Remove HQ users** with confirmation dialog.

### Services Management

- **View all services** in the catalog.
- **Create / edit services** with:
  - Service name (predefined list or custom "Other").
  - Description, duration (minutes), max students, recommended price.
  - Image upload (stored as base64).
  - Country and state/region availability targeting.
- **Delete services** with confirmation dialog.

### Settings

- **YouTube URL**: Configurable URL shown on the booking confirmation page.
- Settings are stored in `settings/hq` document in Firestore.

---

## Franchise Partner Portal

Accessible to users with `franchise_partner` role. Partners are scoped to their assigned location.

### Availability / Timetable

- **Set weekly schedule**: For each day of the week, toggle enabled/disabled and set start/end times.
- **Set timezone**: Select the location's timezone.
- **Buffer minutes**: Configure gap between consecutive bookings (0-120 minutes).
- **Block specific dates**: Mark individual dates as unavailable with an optional reason.

### Booking Requests

- **View incoming bookings** for their location.
- **Update booking status**: Confirmed, completed, or cancelled.
- Bookings are created by customers through the public booking page.

---

## Public Pages

### Find a Centre (`/find-a-centre`)

- **Interactive Google Map** displaying all open franchise locations.
- **Marker clustering** for areas with many locations.
- **Location search**: Type an address or place name (Google Places autocomplete).
- **Geolocation**: "Locate me" button uses the browser's geolocation API to find the nearest centres.
- **Distance calculation**: Shows distance from the user's position to each location.
- **Location details panel**: Click a marker or list item to see the location's name, address, phone, and email.
- **Book assessment link**: Each location card links to the booking page.
- **Mobile-responsive**: Sidebar collapses to a bottom panel on small screens.

### Book an Assessment (`/book-assessment`)

A three-step wizard for customers to book an assessment session:

**Step 1 -- Select Location**
- Displays all open locations.
- Locations can be pre-selected via `?location={locationId}` query parameter (from Find a Centre).

**Step 2 -- Pick Date & Time**
- Calendar date picker showing the current and next month.
- Available time slots calculated from the location's weekly schedule and blocked dates.
- Buffer time between slots is respected.
- Past dates and unavailable dates are disabled.

**Step 3 -- Customer Details**
- Form fields: first name, last name, email, phone, notes (optional).
- On submission:
  - A `bookings` document is created in Firestore.
  - A Cloud Function sends confirmation emails to the customer and the franchise partner.
- **Confirmation screen** with:
  - Booking reference code.
  - Booking details summary.
  - "Add to Google Calendar" link.
  - YouTube video embed (if configured in HQ settings).

---

## Email Notifications

All emails are sent via SendGrid from Cloud Functions.

| Trigger              | Recipient(s)            | Content                                     |
| -------------------- | ----------------------- | ------------------------------------------- |
| Location created     | Location email          | Welcome email with location details         |
| Booking created      | Customer                | Confirmation with booking details, directions link |
| Booking created      | Franchise partner       | New booking notification                    |
| HQ user invited      | Invitee email           | Invitation with sign-in link                |
| Manual resend        | Location email          | Re-sent confirmation (admin action)         |

---

## Authentication & Security

### Google Sign-In

- All authenticated users sign in via Google OAuth 2.0.
- Firebase Auth manages sessions and tokens.

### TOTP Multi-Factor Authentication

- Optional TOTP (Time-based One-Time Password) enrollment.
- Compatible with authenticator apps (Google Authenticator, Authy, etc.).
- Implemented in `useAuth` hook: enroll, finalize, and verify flows.

### Role-Based Access Control

| Capability                    | Master Admin | Admin | Franchise Partner |
| ----------------------------- | :----------: | :---: | :---------------: |
| View all locations            | Yes          | Yes   | Own only          |
| Create/edit locations         | Yes          | Yes   | No                |
| Delete locations              | Yes          | No    | No                |
| View location user logs       | Yes          | Yes   | Own location      |
| Manage HQ users               | Yes          | No    | No                |
| Manage services               | Yes          | Yes   | No                |
| Manage settings               | Yes          | Yes   | No                |
| Manage availability           | No           | No    | Own location      |
| View bookings                 | All          | All   | Own location      |
| Update booking status         | All          | All   | Own location      |

### Firestore Security Rules

Server-side rules enforce all access control. Client-side checks are supplementary. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full rules breakdown.

---

## Key Modules

### `src/hooks/useAuth.js`

Custom React hook providing:
- `signIn()` -- Google popup sign-in.
- `logout()` -- Sign out and clear state.
- `enrolTotp()` -- Generate TOTP secret and QR URI.
- `finaliseTotp(secret, code)` -- Confirm TOTP enrollment.
- `verifyTotp(resolver, code)` -- Verify TOTP during MFA challenge.
- `profile` -- Current user's Firestore profile.
- `loading` -- Auth state loading indicator.

### `src/services/firestore.js`

Firestore CRUD helpers:
- `getLocations()` -- Fetch all locations.
- `createLocation(data)` -- Add a new location.
- `updateLocation(id, data)` -- Update a location.
- `deleteLocation(id)` -- Remove a location.
- `getAvailability(locationId)` -- Fetch schedule for a location.
- `saveAvailability(locationId, data)` -- Save schedule.
- `getUserProfile(uid)` -- Fetch user profile.
- `resendConfirmationEmail(locationId)` -- Invoke callable Cloud Function.
- `logUserAction(logEntry)` -- Write an activity log entry to the `activity_logs` collection.
- `getActivityLogs(locationId)` -- Fetch all activity logs for a location, ordered by most recent first.

### `src/firebase.js`

Firebase SDK initialization: Auth, Firestore, and Functions instances exported for use across the app.

### `functions/index.js`

Four Cloud Functions handling email notifications on Firestore document creation and a callable function for manual email resend.

---

## Open Questions

1. **Franchise Partner onboarding**: Partners are auto-registered when their email matches a location. Is there a planned manual invite flow for partners?
2. **Booking management**: Can HQ admins create bookings on behalf of customers, or is booking creation customer-only?
3. **Service linkage**: Services are managed in the catalog but don't appear to be linked to specific bookings or locations. Is service selection during booking planned?
4. **Notifications**: Are in-app notifications or push notifications planned, or will email remain the sole notification channel?
5. **Reporting/Analytics**: Is there a planned dashboard for booking statistics, location performance, or revenue tracking?
6. **Multi-language support**: The UI is English-only. Is internationalization on the roadmap?
7. **Image storage**: Service images are stored as base64 strings in Firestore documents. Is migration to Firebase Storage / Cloud Storage planned for larger files?
8. **Extended activity logging**: Should additional events be logged (e.g. availability changes, booking status updates, pricing changes)?
