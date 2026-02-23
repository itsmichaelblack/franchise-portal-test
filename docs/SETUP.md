# Setup Guide

## Prerequisites

| Tool         | Version  | Purpose                          |
| ------------ | -------- | -------------------------------- |
| Node.js      | >= 20    | Runtime (required by Cloud Functions) |
| npm          | >= 9     | Package manager                  |
| Firebase CLI | Latest   | Deploy, emulators, config        |
| Git          | Latest   | Version control                  |

Install the Firebase CLI globally if you haven't already:

```bash
npm install -g firebase-tools
```

---

## Clone & Install

```bash
# Clone the repository
git clone https://github.com/itsmichaelblack/franchise-portal-test.git
cd franchise-portal-test

# Install frontend dependencies
npm install

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

---

## Environment Variables & Configuration

### Firebase Project Config

The Firebase client configuration is currently hardcoded in `src/firebase.js`. The project points to `success-tutoring-test`. If you need to use a different Firebase project, update these values:

```javascript
// src/firebase.js
const firebaseConfig = {
  apiKey:            "...",
  authDomain:        "...",
  projectId:         "...",
  storageBucket:     "...",
  messagingSenderId: "...",
  appId:             "...",
  measurementId:     "..."
};
```

### Google Maps API Key

The Google Maps API key is loaded in `index.html`:

```html
<script async
  src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places">
</script>
```

The key must have these APIs enabled in Google Cloud Console:
- Maps JavaScript API
- Places API
- Geocoding API

### SendGrid API Key (Cloud Functions)

The SendGrid API key is stored in Firebase Functions config (not in source):

```bash
firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY"
```

To verify the current config:

```bash
firebase functions:config:get
```

### Firebase Project Alias

The `.firebaserc` file maps the `default` alias to `success-tutoring-test`. To switch projects:

```bash
firebase use your-project-id
```

---

## Running Locally

### Frontend Development Server

```bash
npm run dev
```

This starts the Vite dev server, typically at `http://localhost:5173`. The app supports hot module replacement (HMR) for fast iteration.

### Available npm Scripts

| Script          | Command          | Description                    |
| --------------- | ---------------- | ------------------------------ |
| `npm run dev`   | `vite`           | Start dev server with HMR      |
| `npm run build` | `vite build`     | Production build to `dist/`    |
| `npm run preview` | `vite preview` | Preview production build locally |
| `npm run lint`  | `eslint .`       | Lint the codebase              |

### Firebase Emulators (Optional)

To run Cloud Functions locally without deploying:

```bash
cd functions
npm run serve
```

This runs `firebase emulators:start --only functions`. The emulator suite can also include Firestore and Auth emulators if configured.

To use the full emulator suite:

```bash
firebase emulators:start
```

---

## Firebase Setup (New Project)

If setting up from scratch on a new Firebase project:

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com).

2. **Enable Authentication**:
   - Go to Authentication > Sign-in method.
   - Enable **Google** as a sign-in provider.

3. **Create a Firestore database**:
   - Go to Firestore Database > Create database.
   - Choose production mode (rules will be deployed from `firestore.rules`).

4. **Deploy Firestore rules and indexes**:
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

5. **Create the `activity_logs` composite index**:

   Go to Firebase Console > Firestore > Indexes > Add Index:
   - Collection ID: `activity_logs`
   - Field 1: `locationId` — Ascending
   - Field 2: `timestamp` — Descending
   - Query scope: Collection

   Alternatively, this index will be auto-prompted with a creation link in the browser console the first time the User Logs query runs.

6. **Set up Cloud Functions**:
   ```bash
   firebase functions:config:set sendgrid.api_key="SG.your-key-here"
   firebase deploy --only functions
   ```

7. **Enable Google Maps APIs** in the Google Cloud project linked to your Firebase project.

8. **Create a Master Admin user**:
   - Sign in with Google through the HQ portal.
   - Manually create a `users/{uid}` document in Firestore with:
     ```json
     {
       "name": "Your Name",
       "email": "your-email@example.com",
       "role": "master_admin"
     }
     ```

---

## Project Structure Quick Reference

```
src/
├── main.jsx              # Entry point, URL-based routing
├── App.jsx               # All portal components (~4,400 lines)
├── BookAssessment.jsx    # Public booking wizard
├── FindACentre.jsx       # Public location finder
├── firebase.js           # Firebase SDK init
├── hooks/useAuth.js      # Authentication hook
└── services/firestore.js # Firestore CRUD helpers + activity logging
```

---

## Troubleshooting

### Google Sign-In fails with "auth/unauthorized-domain"

Add `localhost` (or your dev domain) to the authorized domains list:
Firebase Console > Authentication > Settings > Authorized domains.

### Cloud Functions not triggering

- Verify the SendGrid API key is set: `firebase functions:config:get`
- Check function logs: `firebase functions:log`
- Ensure functions are deployed: `firebase deploy --only functions`

### Google Maps not loading

- Verify the API key in `index.html` is valid.
- Ensure Maps JavaScript API, Places API, and Geocoding API are enabled.
- Check the browser console for API key restriction errors.

### User Logs tab shows "No user activity logs yet"

- Activity logs populate automatically as users sign in and perform actions.
- Verify the `activity_logs` composite index exists in Firestore > Indexes.
- Check the browser console for Firestore permission errors — ensure the updated `firestore.rules` have been published.

### Vite dev server port conflict

If port 5173 is in use, Vite will automatically try the next port. You can also specify one:

```bash
npx vite --port 3000
```

---

## Open Questions

1. Should Firebase config values be moved to `.env` files and loaded via `import.meta.env.VITE_*`?
2. Is there a seed script or test data set for local development?
3. Should the Firebase emulator suite be the default local development approach (to avoid writing to production Firestore)?
