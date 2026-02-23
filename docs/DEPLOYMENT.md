# Deployment

## Overview

The application is deployed to **Firebase Hosting** with **Firebase Cloud Functions**. Deployments are automated via GitHub Actions on pushes to `main` and on pull requests.

```
GitHub (main branch)
  └── GitHub Actions
        ├── npm ci && npm run build
        └── Firebase Hosting deploy
              ├── dist/         → Static frontend
              └── functions/    → Cloud Functions (Node.js 20)
```

---

## Automated Deployments (CI/CD)

Two GitHub Actions workflows in `.github/workflows/`:

### 1. Production Deploy (`firebase-hosting-merge.yml`)

**Trigger**: Push to `main` branch.

**Steps**:
1. Checkout code.
2. `npm ci` -- install dependencies.
3. `npm run build` -- Vite production build to `dist/`.
4. Deploy to Firebase Hosting **live channel**.

**Result**: Changes are live at `https://success-tutoring-test.web.app`.

### 2. Preview Deploy (`firebase-hosting-pull-request.yml`)

**Trigger**: Pull request opened or updated.

**Steps**:
1. Checkout code.
2. `npm ci && npm run build`.
3. Deploy to Firebase Hosting **preview channel**.
4. Post a comment on the PR with the preview URL.

**Result**: A temporary preview URL is generated for each PR.

### Required GitHub Secret

Both workflows require:

```
FIREBASE_SERVICE_ACCOUNT_SUCCESS_TUTORING_TEST
```

This is a service account JSON key with Firebase Hosting deploy permissions. Set it in:
GitHub repo > Settings > Secrets and variables > Actions.

---

## Manual Deployment

### Deploy Everything

```bash
firebase deploy
```

This deploys hosting, functions, Firestore rules, and indexes.

### Deploy Individual Components

```bash
# Frontend only
npm run build
firebase deploy --only hosting

# Cloud Functions only
firebase deploy --only functions

# Firestore rules only
firebase deploy --only firestore:rules

# Firestore indexes only
firebase deploy --only firestore:indexes
```

### Deploy Functions Config

SendGrid API key (must be set before deploying functions):

```bash
firebase functions:config:set sendgrid.api_key="SG.your-key-here"
firebase deploy --only functions
```

---

## Build Process

### Frontend Build

```bash
npm run build
```

- **Tool**: Vite 7.3 with the React plugin.
- **Input**: `src/` directory, `index.html`.
- **Output**: `dist/` directory (static files).
- **Config**: `vite.config.js` (minimal -- just the React plugin).

### Cloud Functions

Cloud Functions are deployed as-is (no build step). They run on Node.js 20.

**Dependencies** are in `functions/package.json`:
- `firebase-admin` ^12.0.0
- `firebase-functions` ^5.0.0
- `@sendgrid/mail` ^8.1.0

---

## Hosting Configuration

From `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
        ]
      }
    ]
  }
}
```

- **SPA rewrite**: All URLs serve `index.html` (client-side routing).
- **Security headers**: Clickjacking protection, MIME sniffing prevention, referrer policy.

---

## Firebase Project Details

| Property           | Value                                   |
| ------------------ | --------------------------------------- |
| Project ID         | `success-tutoring-test`                 |
| Hosting URL        | `https://success-tutoring-test.web.app` |
| Functions Runtime  | Node.js 20                              |
| Region             | Default (us-central1)                   |

---

## Cloud Functions Deployment Notes

The four deployed functions and their triggers:

| Function                  | Trigger Type       | Collection  |
| ------------------------- | ------------------ | ----------- |
| `onLocationCreated`       | Firestore onCreate | `locations` |
| `onBookingCreated`        | Firestore onCreate | `bookings`  |
| `onInviteCreated`         | Firestore onCreate | `invites`   |
| `resendConfirmationEmail` | HTTPS callable     | N/A         |

After deploying functions, verify they are active:

```bash
firebase functions:log
```

---

## Firestore Rules & Indexes

### Rules (`firestore.rules`)

Deploy when security rules change:

```bash
firebase deploy --only firestore:rules
```

Rules enforce role-based access across all collections. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full rules breakdown.

### Indexes (`firestore.indexes.json`)

Deploy when composite indexes change:

```bash
firebase deploy --only firestore:indexes
```

Current composite indexes:

| Collection     | Fields                              |
| -------------- | ----------------------------------- |
| `locations`    | `createdAt` DESC, `name` ASC       |
| `availability` | `locationId` ASC, `updatedAt` DESC |

---

## Rollback

Firebase Hosting keeps a history of deployments. To roll back:

1. Go to Firebase Console > Hosting.
2. Find the previous deployment in the release history.
3. Click "Rollback" to restore it.

For Cloud Functions, redeploy a previous commit:

```bash
git checkout <previous-commit>
cd functions
firebase deploy --only functions
```

---

## Monitoring

| What                  | Where                                                  |
| --------------------- | ------------------------------------------------------ |
| Function logs         | `firebase functions:log` or Firebase Console > Functions |
| Hosting traffic       | Firebase Console > Hosting                             |
| Firestore usage       | Firebase Console > Firestore                           |
| Auth users            | Firebase Console > Authentication                      |
| Error tracking        | Google Cloud Console > Error Reporting                 |

---

## Open Questions

1. Cloud Functions are deployed to the default region (us-central1). Should they be deployed closer to the primary user base (e.g., australia-southeast1)?
2. The CI/CD pipeline deploys hosting only, not functions. Should functions deployment be added to the GitHub Actions workflow?
3. There is no staging/production environment separation. Both CI workflows target the same Firebase project. Is a multi-environment setup planned?
