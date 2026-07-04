# Paint Intelligence Platform

A paint decision engine that helps customers choose a wall color confidently in under 60 seconds. Built for in-store dealer demos — upload a room photo, preview shades live on the walls, compare side by side, capture a lead, and sync everything to a real backend.

## What's in this repo

| Path | Description |
|------|-------------|
| `paint-preview-app/` | Main app — static HTML/CSS/JS, runs in any browser with no build step |
| `server/` | Phase 4 backend — Node.js + Express + PostgreSQL, serves the frontend on one port |
| `paint-preview-app/react-canvas-component/` | Reusable React/Next.js component extracting the same canvas logic |
| `test-scripts/` | Playwright E2E tests and backend smoke test scaffolding |
| `master-plan.txt` | Phase roadmap from Decision Engine through CRM platform |

---

## Quick start

### Option A — With backend (Phase 4, recommended)

**Docker (easiest):**

```bash
cp server/.env.example server/.env
docker-compose up -d
# → http://localhost:3001
```

**Local Node + PostgreSQL:**

```bash
# Create a database, then set DATABASE_URL in server/.env (see server/.env.example)
cd server
npm install
npm run migrate:up
npm run start:with-migrate   # or: npm start (after migrations)
# → http://localhost:3001
```

The Express server serves the frontend **and** the API on a single port. Open [http://localhost:3001](http://localhost:3001) and use **Settings → Server Sync** to create an account.

### Option B — Standalone (no server)

```bash
cd paint-preview-app
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Everything works offline via `localStorage` — no account needed.

---

## Features

### Phase 1 — Decision Engine (done)

- **Room photo upload** — works from file or camera roll on mobile
- **Shade suggestions** — top 5 shades derived from the dominant room color
- **Live wall recolor** — natural HSL-based tint that preserves texture and lighting
- **Smart wall masking** — software region-growing with upper-wall bias, no manual setup needed
- **ML wall assist (beta)** — optional DeepLab segmentation fused with the heuristic mask
- **Tap to select wall** — click any point on the image to lock the wall region
- **Multi-wall tabs** — up to 5 independent wall zones, each with its own shade
- **Brush mask mode** — paint or erase the mask with a live cursor showing brush radius
- **Undo / redo** — full history stack (up to 20 steps) per wall tab
- **Edge feathering** — adjustable feather radius for clean mask boundaries
- **Before / after toggle** — instant flip to compare original and recolored
- **Compare drag slider** — drag a split-view handle to reveal any proportion of two shades side by side
- **Share / Export** — native share sheet on supported devices, PNG download fallback

### Phase 2 — Conversion Layer (done)

- **Real shade catalog** — 63 curated shades across Asian Paints, Dulux, Berger, and Nerolac loaded from `shades.json`
- **Shade search** — type any shade name, brand, or color family to instantly filter the catalog
- **Contact Dealer** — capture customer name, phone, email, notes, per-wall shade breakdown, and a live preview snapshot
- **Local Leads Inbox** — leads persisted in the browser; list, detail view, delete
- **Lead package export** — downloads snapshot PNG + structured `.json` sidecar (brand + shade per wall, dealer info)
- **Cost estimator** — estimates litres and INR cost for a standard room (40 sq m, 2 coats) on shade selection
- **Session draft save / restore** — workspace auto-saved; "Restore draft" lets users resume without re-uploading
- **Storage safety** — graceful fallback when localStorage is full

### Phase 3 — Pilot Validation (done)

- **Session analytics engine** — tracks `session_start`, `shade_selected` (with time-to-first-pick), `share_exported`, `contact_opened`, `contact_saved` in localStorage (up to 600 events)
- **Pilot Analytics dashboard** — second tab inside the Leads modal; KPI cards (sessions/30d, avg decision time, contact rate, share rate) and a 7-day bar chart
- **Dealer Settings** — Settings button opens a modal to set shop name, dealer name, and phone; shown as branded tagline in the hero
- **Dealer branding in exports** — dealer info embedded in every exported lead `.json`
- **Analytics export** — Settings → Download Analytics JSON for pilot review
- **Clear analytics** — reset event log before handing device to a new dealer

### Phase 4 — Backend Foundation (done)

A full Node.js + Express + PostgreSQL backend in `server/` with:

| Endpoint | What it does |
|----------|-------------|
| `POST /api/auth/register` | Create a dealer account (shop name, email, password) — returns JWT |
| `POST /api/auth/login` | Authenticate — returns JWT (30-day expiry) |
| `GET /api/auth/me` | Validate token, return tenant profile |
| `GET /api/leads` | List all leads for the signed-in dealer |
| `POST /api/leads` | Create / upsert a lead (id, name, phone, shades, snapshot) |
| `GET /api/leads/:id` | Single lead with full snapshot |
| `DELETE /api/leads/:id` | Delete a lead |
| `GET /api/shades` | Full catalog — searchable via `?q=` |
| `GET /api/shades/:id` | Single shade |
| `GET /api/dealer` | Get dealer profile |
| `PUT /api/dealer` | Update shop name, dealer name, phone |
| `POST /api/events` | Ingest a funnel analytics event |
| `GET /api/events/summary` | 30-day funnel metrics (sessions, contact rate, share rate, avg decision time, 7-day daily breakdown) |

**Frontend sync (graceful degradation):**
- All leads sync to the server automatically when signed in; deletes propagate too
- Cross-device lead restore fetches preview snapshots via `GET /api/leads/:id`
- Dealer profile pulled from server on sign-in
- Pilot Analytics dashboard uses server funnel metrics when signed in
- Shade catalog loads from `/api/shades` when signed in (falls back to `shades.json` offline)
- Every analytics event is sent to `/api/events` in addition to being stored locally
- Dealer settings saved via `PUT /api/dealer` on form submit
- On startup, a stored token is validated and leads are merged from the server
- App stays fully functional offline — server sync is always best-effort

**Server Sync in Settings modal:**
- Sign In / Create Account tabs
- Live connection status chip (green "Connected" / grey "Not connected")
- Logout

### Phase 5 — CRM Lite (done)

When signed in to the backend:

| Endpoint | What it does |
|----------|-------------|
| `GET/POST/PUT/DELETE /api/customers` | Customer CRUD (search via `?q=`) |
| `GET /api/customers/:id/timeline` | Merged leads + preview sessions for a customer |
| `GET/POST/PUT/DELETE /api/sites` | Site/project per customer (`?customerId=`) |
| `POST /api/sessions` | Record preview session events on the timeline |

- **Customers** button in the app — browse, search, add, **edit, and delete** customers
- **Sites/projects** — add via a form on the customer detail view
- **Lead capture** auto-creates or links customers by phone; optional customer + site link
- **Timeline** on each customer — session starts, shade picks, lead captures
- **Lead → customer** — jump from a lead to its linked customer profile
- **Offline cache** — last-synced customers stay viewable offline; writes require sign-in

### Phase 6 — Commercial Modules (in progress)

Quote → order flow for signed-in dealers.

| Endpoint | What it does |
|----------|-------------|
| `GET/POST /api/quotes` | List (filter by `?customerId=` / `?status=`) and create quotes with line items |
| `GET/PUT/DELETE /api/quotes/:id` | Read, replace (header + items), and delete a quote |
| `PATCH /api/quotes/:id/status` | Move a quote through draft → sent → accepted / rejected |
| `POST /api/quotes/:id/convert` | Create an order from the quote and lock the quote as `converted` |
| `GET/POST /api/orders` | List and create orders (direct or via conversion) |
| `GET/DELETE /api/orders/:id` | Read and delete an order |
| `PATCH /api/orders/:id/status` | Move an order through pending → confirmed → fulfilled / cancelled |

- **Quotes** button in the app — a Quotes / Orders tabbed modal with a status filter
- **Quote builder** — pick a customer + site, add line items manually or from the shade catalog (auto-fills price/L and standard-room litres), set discount and tax rate, live totals
- **Server-computed totals** — subtotal, discount, tax, and total are always recomputed on the server (line totals are never trusted from the client)
- **Per-tenant document numbers** — sequential `Q-0001` / `O-0001`, isolated per dealer
- **Convert to order** — one click turns an accepted quote into an order (items + totals snapshotted); the quote is then read-only
- **Status workflows** — inline status controls on the quote/order detail view
- Requires sign-in (commercial data is server-only; the offline decision flow is unaffected)

Inventory basics + stock status:

| Endpoint | What it does |
|----------|-------------|
| `GET/POST /api/inventory` | List (search `?q=`, filter `?status=`) and create stock items |
| `GET/PUT/DELETE /api/inventory/:id` | Read (with movement history), update metadata, delete |
| `POST /api/inventory/:id/adjust` | Apply a signed stock movement (`{delta, reason}`) |
| `GET /api/inventory/summary` | Counts by stock status + total stock value |

- **Inventory** button — item list with search, stock-status filter, and summary chips (items / low / out / stock value)
- **Stock status** derived from quantity vs. reorder level: `in_stock` / `low_stock` / `out_of_stock`
- **Auditable movements** — every quantity change (opening stock, receive, issue, correction) is recorded with a running balance; adjustments can't drive stock negative
- **Catalog link** — optionally link an item to a shade to auto-fill name/brand/price
- **Per-tenant SKUs** — optional, uniquely enforced only when provided

---

## User flow (demo script)

1. Start the server: `cd server && npm start`
2. Open [http://localhost:3001](http://localhost:3001)
3. **Settings → Server Sync → Create Account** — enter your shop name, email, password.
4. **Settings → Dealer Profile** — set your dealer name and phone number → Save.
5. Upload a room photo. The session timer starts and a `session_start` event fires (locally + server).
6. The app suggests 5 matching shades — click one to apply it. Each pick fires `shade_selected` with time-to-first-pick.
7. Adjust: add wall tabs, use brush or tap-to-select, toggle before/after, drag the compare slider.
8. Click **Contact Dealer** — fill in customer name and phone → Save Lead.
   - Lead saved locally and synced to `POST /api/leads`.
9. **Leads → Export Package** — downloads snapshot PNG + `.json` (with dealer info).
10. **Leads → Pilot Analytics** — review KPI cards and bar chart.
11. **Customers** — view customer timeline (auto-created from leads when signed in).
12. After the pilot: **Settings → Download Analytics JSON** for the full event log.

---

## Running tests

### E2E (Playwright)

```bash
pip install -r test-scripts/requirements.txt
python3 -m playwright install chromium

# Start a server first, then:
python3 test-scripts/frontend_e2e_playwright.py --app-url http://localhost:3001
```

### API smoke test

```bash
cd server && npm start &   # start server

# Register + full round-trip
curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"shopName":"My Shop","email":"me@shop.com","password":"demo1234"}'
```

---

## React component

`paint-preview-app/react-canvas-component/` contains a self-contained `WallRecolorCanvas.tsx` component and `pixelUtils.ts` you can copy into any React/Next.js project. See the [component README](paint-preview-app/react-canvas-component/README.md) for integration steps.

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | Done | Product contract — scope, flow, success metrics |
| 1 | Done | Decision Engine — masking, recolor, compare, share |
| 2 | Done | Conversion layer — shade catalog, search, lead capture, inbox, cost estimator, session drafts |
| 3 | Done | Pilot validation — analytics engine, dealer branding, KPI dashboard |
| 4 | Done | Backend foundation — auth, lead/shade/dealer APIs, funnel event tracking, Docker, CI |
| 5 | Done | CRM Lite — customer CRUD, sites/projects, session timeline (server sync) |
| 6 | In progress | Commercial modules — quote → order flow + inventory/stock status (credit ledger next) |
| 7+ | Future | AI palette recommendations, dealer assistant |

See [`master-plan.txt`](master-plan.txt) for the full execution plan with sprint breakdowns and success metrics.
