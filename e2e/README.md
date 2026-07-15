# PaintCRM E2E Tests (Playwright)

Browser end-to-end tests for the PaintCRM dealer app. They exercise real UI flows against a running server at `http://localhost:3001` (or `PLAYWRIGHT_BASE_URL`).

## Prerequisites

- **Node.js 20+**
- **PostgreSQL** running locally (Docker is fine)
- Database URL reachable from the server (default: `postgresql://postgres:postgres@localhost:5432/paintcrm`)

## One-time setup

```bash
# Server + DB
cd server
cp .env.example .env   # if you have not already
npm ci
npm run migrate:up

# Frontend build (server serves paint-preview-app/dist when present)
cd ../paint-preview-app
npm ci
npm run build

# Playwright
cd ../e2e
npm ci
npx playwright install chromium
```

## Start the app

In a separate terminal:

```bash
cd server
NODE_ENV=test \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/paintcrm \
JWT_SECRET=test-secret-for-ci-at-least-32-chars \
node index.js
```

Wait until `http://localhost:3001/api/health` returns JSON with `status: "ok"` (or `healthy: true`).

`NODE_ENV=test` keeps CORS permissive and relaxes rate limits for repeated auth in the suite. Production mode also works if you set `JWT_SECRET` (≥32 chars) and `ALLOWED_ORIGINS=http://localhost:3001`.

## Run tests

```bash
cd e2e
npm test
```

Useful variants:

```bash
npm run test:headed   # visible browser
npm run test:ui       # Playwright UI mode
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm test
```

## What is covered

| Spec | Flow |
|------|------|
| `auth.spec.js` | Register → app, logout, login again |
| `password-reset.spec.js` | Forgot password success message |
| `guest.spec.js` | Continue without account |
| `leads.spec.js` | Upload photo, Contact Dealer lead |
| `customers.spec.js` | Create + search customer |
| `quotes.spec.js` | Quote with line item → convert to order |
| `inventory.spec.js` | Create + search inventory item |
| `ledger.spec.js` | Open ledger modal when signed in |
| `tenant-isolation.spec.js` | Dealer A customer hidden from dealer B |
| `404.spec.js` | Unknown route returns SPA shell (no 500) |
| `dashboard.spec.js` | Pilot Analytics + Settings smoke |

Tests use unique emails via `Date.now()` and do not require MSG91, OpenAI, or SMTP.

## CI

The `e2e` job in `.github/workflows/ci.yml` starts Postgres, migrates, builds the frontend, boots the server, installs Chromium, and runs this suite. Failed runs upload `e2e/playwright-report/` as an artifact.

## Configuration

- `playwright.config.js` — `baseURL` from `PLAYWRIGHT_BASE_URL`, `workers: 1`, `retries: 1` on CI
- `helpers/auth.js` — register/login/guest helpers
- `helpers/app.js` — app shell, photo upload, CRM helpers
- `fixtures/tiny-room.png` — minimal image for lead capture flow
