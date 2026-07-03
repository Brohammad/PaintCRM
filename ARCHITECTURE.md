# PaintCRM — System Architecture

> **Purpose:** This document is the authoritative technical reference for the PaintCRM system. It covers every layer of the stack — from pixel-level canvas algorithms to the REST API and PostgreSQL schema — and explains the reasoning behind each design decision.
>
> **Version:** 2.0 (Enterprise Edition) — includes containerization, CI/CD, monitoring, and horizontal scaling path.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [Frontend Architecture](#3-frontend-architecture)
   - 3.1 [State Model](#31-state-model)
   - 3.2 [Canvas Rendering Pipeline](#32-canvas-rendering-pipeline)
   - 3.3 [Wall Masking Subsystem](#33-wall-masking-subsystem)
   - 3.4 [HSL Recolor Engine](#34-hsl-recolor-blend)
   - 3.5 [ML Wall Segmentation (DeepLab)](#35-ml-wall-segmentation-deeplab)
   - 3.6 [Shade Catalog & Cost Estimator](#36-shade-catalog--cost-estimator)
   - 3.7 [Lead Capture & Local Persistence](#37-lead-capture--local-persistence)
   - 3.8 [Session Analytics Engine](#38-session-analytics-engine)
   - 3.9 [Backend API Sync Layer](#39-backend-api-sync-layer)
4. [Backend Architecture](#4-backend-architecture)
   - 4.1 [Server Entry Point & Middleware](#41-server-entry-point--middleware)
   - 4.2 [Authentication — JWT + bcrypt](#42-authentication--jwt--bcrypt)
   - 4.3 [Database Schema (PostgreSQL)](#43-database-schema-postgresql)
   - 4.4 [API Route Reference](#44-api-route-reference)
   - 4.5 [Funnel Analytics Query Design](#45-funnel-analytics-query-design)
   - 4.6 [Containerization & Deployment](#46-containerization--deployment)
   - 4.7 [Monitoring & Observability](#47-monitoring--observability)
   - 4.8 [CI/CD Pipeline](#48-cicd-pipeline)
5. [Data Flows](#5-data-flows)
   - 5.1 [Image Upload → Wall Mask → Render](#51-image-upload--wall-mask--render)
   - 5.2 [Lead Capture Flow (Online)](#52-lead-capture-flow-online)
   - 5.3 [Auth + Session Restore Flow](#53-auth--session-restore-flow)
   - 5.4 [Analytics Event Flow](#54-analytics-event-flow)
6. [Key Algorithms](#6-key-algorithms)
   - 6.1 [Candidate Map Generation](#61-candidate-map-generation)
   - 6.2 [Color-Constrained Flood Fill](#62-color-constrained-flood-fill)
   - 6.3 [Connected-Component Scoring](#63-connected-component-scoring)
   - 6.4 [Edge Feathering (Alpha Decay)](#64-edge-feathering-alpha-decay)
   - 6.5 [Natural Recolor Blend](#65-natural-recolor-blend)
   - 6.6 [ML + Heuristic Mask Fusion](#66-ml--heuristic-mask-fusion)
7. [Storage & Offline-First Design](#7-storage--offline-first-design)
8. [Security Design](#8-security-design)
9. [Technology Choices & Rationale](#9-technology-choices--rationale)
10. [Performance Characteristics](#10-performance-characteristics)
11. [Scalability Path](#11-scalability-path)
12. [Testing Strategy](#12-testing-strategy)
13. [Phase Roadmap & Architecture Evolution](#13-phase-roadmap--architecture-evolution)

---

## 1. System Overview

PaintCRM is a **paint color decision engine** designed for in-store dealer demos. Its core job: let a customer upload a room photo and see any paint shade applied to the walls in under 60 seconds, then capture a qualified lead before they leave.

The system is intentionally **offline-first**. A dealer should be able to run a demo with no internet connection and no account. When a backend is available (Phase 4), leads and events sync automatically.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│   paint-preview-app/   (static HTML/CSS/JS)             │
│   ┌───────────────────────────────────────────────┐     │
│   │  Canvas Engine  │  Shade Catalog  │  Lead UI  │     │
│   │  (masking +     │  (63 shades,    │  (capture,│     │
│   │   recolor)      │   search, cost) │   inbox,  │     │
│   │                 │                 │   export) │     │
│   └───────────────────────────────────────────────┘     │
│   ┌───────────────────────────────────────────────┐     │
│   │  localStorage                                 │     │
│   │  leads_v1 │ analytics_v1 │ draft_v1 │ dealer  │     │
│   └───────────────────────────────────────────────┘     │
│   ┌───────────────────────────────────────────────┐     │
│   │  Phase 4 API Sync Layer (best-effort)         │     │
│   │  Bearer JWT → /api/*                          │     │
│   └───────────────────────────────────────────────┘     │
└─────────────────────┬───────────────────────────────────┘
                      │  HTTP/JSON  (when server is running)
┌─────────────────────▼───────────────────────────────────┐
│                  server/ (Node.js + Express)             │
│                                                         │
│   Routes: /api/auth  /api/leads  /api/shades            │
│           /api/dealer  /api/events                      │
│                                                         │
│   Static: serves paint-preview-app/ (same port)         │
│                                                         │
│   PostgreSQL: tenants │ leads │ shades │ events          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Repository Layout

```
PaintCRM/
├── paint-preview-app/          # Frontend (zero build step)
│   ├── index.html              # Single-page app shell, all modals inline
│   ├── script.js               # ~2750 lines, all logic — no framework
│   ├── styles.css              # ~940 lines, custom design system
│   ├── shades.json             # 63-shade catalog (Asian Paints, Dulux, Berger, Nerolac)
│   └── react-canvas-component/ # Portable React/Next.js extraction of canvas logic
│       ├── WallRecolorCanvas.tsx
│       └── pixelUtils.ts
│
├── server/                     # Phase 4+ enterprise backend
│   ├── index.js                # Server entry point with graceful shutdown
│   ├── app.js                  # Express app factory with all middleware
│   ├── lib/
│   │   ├── db.js               # PostgreSQL connection pooling + query instrumentation
│   │   └── metrics.js          # Shared Prometheus registry and custom metrics
│   ├── middleware/
│   │   └── auth.js             # JWT verification with DB check
│   ├── routes/
│   │   ├── auth.js             # register / login / me
│   │   ├── leads.js            # lead CRUD
│   │   ├── shades.js           # catalog API
│   │   ├── dealer.js           # dealer profile
│   │   └── events.js           # funnel event ingestion + summary
│   ├── migrations/             # Database migrations (node-pg-migrate)
│   │   ├── 001_create_tenants.js
│   │   ├── 002_create_shades.js
│   │   ├── 003_create_leads.js
│   │   ├── 004_create_events.js
│   │   └── 005_seed_shades.js
│   ├── tests/                  # Jest test suite (setupFilesAfterEnv: setup.js)
│   │   ├── setup.js
│   │   ├── auth.test.js
│   │   ├── leads.test.js
│   │   ├── events.test.js
│   │   ├── shades.test.js
│   │   └── dealer.test.js
│   ├── public/
│   │   └── login.html          # Standalone auth page
│   ├── Dockerfile              # Multi-stage production build
│   ├── package.json
│   └── .env.example
│
├── docker-compose.yml          # Full stack orchestration (app + db + redis + monitoring)
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI/CD pipeline
├── monitoring/
│   ├── prometheus.yml          # Prometheus scraping configuration
│   └── grafana/
│       ├── dashboards/         # Pre-configured dashboards
│       └── datasources/        # Prometheus connection
├── test-scripts/               # Playwright E2E tests
├── master-plan.txt             # Product & engineering roadmap
├── ARCHITECTURE.md             # This document
├── OPERATIONS.md               # Production deployment & monitoring guide
├── README.md                   # Quick-start and feature overview
└── .gitignore
```

---

## 3. Frontend Architecture

The frontend is deliberately a **zero-dependency, zero-build-step** single HTML page. No React, no Webpack, no TypeScript. The reasoning: a dealer should be able to open `index.html` directly from a USB stick if needed, and any developer should be able to read and modify the code without toolchain setup.

All logic lives in `script.js` (~2750 lines), organized into named sections:

| Section | Lines (approx.) | Responsibility |
|---------|----------------|----------------|
| Globals & state | 1–140 | DOM refs, `state` object, storage keys |
| Shade catalog | 141–176 | Fetch, fallback, cost estimate |
| Color math | 177–251 | `hexToRgb`, `rgbToHsl`, `hslToRgb`, `clamp` |
| ML subsystem | 252–437 | DeepLab load, segment, fuse, label mapping |
| Wall detection | 438–855 | Candidate map, flood fill, component scoring |
| Shade / zone UI | 856–1170 | Suggestions, zone tabs, swatch rendering |
| Recolor engine | 1171–1278 | `applyTint`, `renderTinted`, `drawPreview` |
| Canvas interaction | 1279–1520 | Compare slider, brush, pick-wall, add/remove zones |
| Image upload | 1521–1591 | File read → ImageData → pipeline init |
| Export | 1565–1591 | PNG + Web Share API |
| Phase 2 — Leads | 1592–1908 | localStorage CRUD, modals, export package |
| Phase 2 — Draft | 1909–2045 | Save/restore draft, clear session |
| Phase 4 — API sync | 2046–2260 | apiRequest, sync functions, auth helpers |
| Phase 3 — Analytics | 2261–2430 | Event tracking, local dashboard, export |
| Phase 3 — Settings | 2431–2490 | Dealer settings, branding |
| Event listeners | 2491–2749 | DOM wiring, startup calls |

### 3.1 State Model

All mutable application state lives in a single `state` object:

```javascript
const state = {
  originalImage: HTMLImageElement | null,   // the uploaded room photo
  originalPixels: ImageData | null,          // raw RGBA pixels, never mutated
  imageRect: { x, y, w, h } | null,         // letterbox rect on canvas

  shades: Shade[],          // top-5 suggestions for current image
  activeShade: Shade | null,
  compareShade: Shade | null,

  zones: Zone[],            // wall tab array (max 5)
  activeZoneId: number | null,
  nextZoneId: number,       // monotonic counter for stable IDs

  compareSliderX: number,   // 0..1 position of the compare drag handle
  isBrushing: boolean,
  brushCursor: {x, y} | null,

  mlModel: deeplab.SemanticSegmentation | null,
  mlMask: Uint8Array | null,    // 0/1 per pixel from DeepLab
  mlLoading: boolean,
  mlReady: boolean,
  mlError: string | null,
};
```

Each `Zone` object:

```javascript
{
  id: number,              // unique within session
  label: string,           // "Wall 1", "Wall 2", …
  shadeHex: string,        // "#RRGGBB"
  seed: {x, y} | null,    // tap-to-seed point
  autoMask: Uint8Array | null,    // computed by pipeline, cached
  manualMask: Uint8Array | null,  // painted by brush (same size as image)
  manualEnabled: boolean,
  maskHistory: Uint8Array[],  // undo stack (up to 20 snapshots)
  maskFuture:  Uint8Array[],  // redo stack
}
```

`originalPixels` is captured once on image load and **never written to**. Every render reads from it and writes into a fresh `Uint8ClampedArray`, so the source of truth is always available.

### 3.2 Canvas Rendering Pipeline

Three layered `<canvas>` elements share the same dimensions:

```
┌────────────────────────────────┐
│  brushCursorCanvas (top)       │  pointer-events pass-through; shows brush ring
│  compareCanvas (middle)        │  hidden unless compare mode; shows left half
│  previewCanvas (bottom)        │  always visible; the recolored room
└────────────────────────────────┘
```

The render pipeline on every shade/mask change:

```
originalPixels (ImageData, read-only)
       │
       ▼
renderTinted(pixels, compareHex?)
  ├── for each zone (sorted: active zone last):
  │      getZoneMask(zone, pixels, sensitivity)
  │        ├── returns manualMask if manualEnabled
  │        └── returns autoMask (compute if stale, cache result)
  │      createFeatheredAlphaMask(mask, featherRadius)
  │      applyTint(data, alphaMask, shadeRgb, opacity, useNatural)
  └── returns ImageData
       │
       ▼
drawImageFit(ctx, image, canvas)    // letterbox into canvas
putImageData(renderedData, x, y)    // blit result
```

`drawPreview()` triggers this pipeline for the main view; `drawCompareIfEnabled()` triggers a second pass with `compareShade.hex` for the compare canvas, then `applyCompareSlider()` clips it at the handle's X position.

### 3.3 Wall Masking Subsystem

The masking subsystem has three layers, combined in priority order:

```
Priority 1 (highest): manualMask   — brush-painted pixels
Priority 2:           autoMask     — heuristic + (optional) ML
Priority 3 (lowest):  simple pass  — isLikelyWallPixel per-pixel (no mask)
```

**Heuristic auto-mask pipeline (`createAutoMask`):**

```
Step 1: createCandidatesMap(pixels, sensitivity)
  → Per-pixel: saturation + brightness filter (isLikelyWallPixel)
  → Compute per-pixel luminance gradient (texture proxy)
  → Exclude high-texture pixels (furniture, art, floors)
  → Exclude bottom 26% if texture > floor threshold (floor exclusion)
  → 3×3 median refinement pass

Step 2: Select seed point
  → If user tapped: findNearestCandidate() within 28px radius
  → Otherwise: auto-seed in upper-center strip of candidates
               (upper-wall bias: walls are usually upper-half)

Step 3: growRegionWithColorConstraint(pixels, candidates, seed)
  → BFS from seed; expand if:
      (a) pixel is in candidates map, AND
      (b) RGB distance from seed color < threshold (color coherence)
  → Returns binary mask (Uint8Array, 0/1 per pixel)

Step 4: Connected-component scoring
  → Label connected components in the grown region
  → Score = size × upper_half_bias_weight
  → Keep top-N components (wall regions are usually large and upper)

Step 5: smoothMask()
  → 3×3 majority vote to remove isolated noise pixels

Step 6 (if user enabled feathering):
  → createFeatheredAlphaMask()
  → Distance transform from mask boundary → Gaussian alpha decay
```

**Tap-to-seed override:**
When the user taps a point on the canvas, `handleCanvasPick` maps the click to image coordinates via `getLocalPoint` (accounts for letterbox rect), stores it as `zone.seed`, and invalidates `zone.autoMask` (sets it to `null`). Next render recomputes via `createSeedMask` which uses a single flood-fill from that exact point.

**Brush mask:**
`paintBrush(point)` writes 1s (or 0s in erase mode) into `zone.manualMask` in a circle of `brushSizeSlider.value` radius. Each pointer-down calls `pushMaskHistory(zone)` (deep copies the current mask into the undo stack). Undo/redo swap between `maskHistory` and `maskFuture`.

### 3.4 HSL Recolor Engine

The tinting function (`applyTint`) runs in two modes, toggled by "Natural recolor mode":

**Simple blend (natural off):**
```
output[p] = lerp(source[p], shade[p], blend × alpha[p])
```
Flat, predictable, but flattens texture at high opacity.

**Natural HSL blend (natural on):**
```
source_hsl = rgbToHsl(source[p])
target_hsl = rgbToHsl(shade)

output_h = target_hsl.h                          // adopt shade hue exactly
output_s = 0.35 × source_hsl.s + 0.65 × target_hsl.s  // weighted saturation
output_l = 0.90 × source_hsl.l + 0.10 × target_hsl.l  // mostly preserve source lightness

mapped = hslToRgb(output_h, output_s, output_l)
output[p] = lerp(source[p], mapped, blend × alpha[p])
```

The key insight: by keeping 90% of the source lightness, the natural mode preserves shadows, highlights, and texture grain even at full opacity. The shade's exact hue is adopted, but the room's lighting model is preserved.

### 3.5 ML Wall Segmentation (DeepLab)

DeepLab v3 (`@tensorflow-models/deeplab`, Pascal VOC variant) is loaded lazily on first image upload via `ensureMlModel()`. It runs in the browser via TensorFlow.js WebGL backend.

**Label mapping:** The VOC vocabulary doesn't have a "wall" class. The implementation maps adjacent indoor structural classes:

```javascript
const WALL_LABELS = new Set(["wall", "ceiling", "floor", "building",
                              "door", "window", "fence"]);
```

After segmentation, `extractMaskFromSegmentation` bilinearly resamples the label map to match image dimensions, then marks pixels whose class is in `WALL_LABELS` as candidate wall pixels.

**Fusion with heuristic mask (`fuseMasksWithMl`):**
```
fused[p] = heuristic[p] === 1 && ml[p] === 1 ? 1 : 0   // intersection (default)
         — OR —
fused[p] = heuristic[p] === 1 || ml[p] === 1 ? 1 : 0   // union (high recall)
```

The intersection mode is the default because DeepLab's indoor label set is broad, and the heuristic's texture/saturation filter provides strong precision. Union mode is available when the heuristic under-segments (e.g., highly saturated walls).

### 3.6 Shade Catalog & Cost Estimator

`shades.json` contains 63 manually curated shades across four brands:

| Brand | Count | Price range (₹/L) |
|-------|-------|--------------------|
| Asian Paints Royale | ~20 | ₹320 |
| Dulux Silk | ~15 | ₹290 |
| Berger Silk | ~13 | ₹270 |
| Nerolac Impression | ~15 | ₹260 |

Each shade has: `id`, `name`, `brand`, `collection`, `hex`, `pricePerL`, `colorFamily`, `tags`.

**Suggestion algorithm (`buildSuggestions`):**
1. Sample the dominant color from a 20×20 center crop of the image.
2. Compute RGB distance² from every catalog shade to the dominant color.
3. Sort ascending, take the top 5.
4. The first suggestion is auto-applied to the active wall zone.

**Cost estimator:**
```
ROOM_SQ_M = 40        // standard Indian 2BR ≈ 40 sq metres paintable surface
COVERAGE  = 11        // sq metres per litre (2-coat industry average)
litres    = ceil(ROOM_SQ_M / COVERAGE)   // → 4 litres
total_INR = litres × shade.pricePerL
```
Displayed immediately on shade selection; hidden when no shade is active.

**Search (`runShadeSearch`):**
Multi-token AND search across `[name, brand, collection, hex, tags]`. Splits query on whitespace so "dulux teal" finds Dulux shades containing "teal". Returns first 12 matches rendered as swatches.

### 3.7 Lead Capture & Local Persistence

Leads are stored as a JSON array in `localStorage["paintcrm_leads_v1"]`. Each lead:

```javascript
{
  id: "lead_<timestamp>_<random>",
  ts: 1234567890000,           // Unix ms
  name: "Alex Rivera",
  phone: "555-1234",
  email: "alex@email.com",
  notes: "Wants low-VOC",
  shades: [
    { wall: "Wall 1", hex: "#287878", name: "Peacock Teal",
      brand: "Asian Paints", collection: "Royale" }
  ],
  snapshot: "data:image/png;base64,..."  // 640×360 PNG thumbnail
}
```

The snapshot is captured by `openContactModal` before the form is shown: the current preview canvas is scaled to 640×360 into `leadSnapshotCanvas` so the customer can see exactly what they chose.

**Export package** (`exportCurrentLeadPackage`): downloads two files:
1. `lead-<name>-<date>.png` — the snapshot directly
2. `lead-<name>-<date>.json` — structured metadata including dealer info, ISO timestamps, brand + shade per wall

**Session draft** (`saveDraft` / `loadDraft`):
- On every shade change, the image (downscaled to max 960px wide, JPEG 82%) + zone colors are saved to `localStorage["paintcrm_draft_v1"]`.
- On next page load, if a draft exists, "Restore draft" appears. Loading restores the image and zone labels/colors but clears masks (user re-brushes if needed).
- `safeLsSet` catches `QuotaExceededError`, removes the draft (the heaviest item), and retries.

### 3.8 Session Analytics Engine

All events are stored in `localStorage["paintcrm_analytics_v1"]` (capped at 600 events) and simultaneously POSTed to `/api/events` when a server token is present.

**Event types:**

| Event | When fired | Key payload |
|-------|-----------|-------------|
| `session_start` | Image uploaded | `dealer`, `sessionId` |
| `shade_selected` | Shade clicked | `hex`, `name`, `brand`, `ttFirstShade` (ms) |
| `share_exported` | Export button | `ttAction` (ms from session start) |
| `contact_opened` | Contact Dealer clicked | — |
| `contact_saved` | Lead form submitted | `leadId`, `ttAction` |

**Local dashboard** (Pilot Analytics tab):
- Sessions (30d) = count of distinct `session_start` events in rolling 30 days
- Avg decision time = mean of `ttFirstShade` across all sessions that have it
- Contact rate = sessions with `contact_saved` / total sessions
- Share rate = sessions with `share_exported` / total sessions
- 7-day bar chart = `session_start` events grouped by `date(ts)` for the last 7 days, rendered via inline `<div>` bars with `height` proportional to the max day count

### 3.9 Backend API Sync Layer

The API sync layer is a set of `async` functions that sit alongside the existing localStorage functions. The design principle: **localStorage is always the source of truth; the server is a durable backup**.

```
captureLeadFromForm()
  → saveLeads()              ← localStorage write (synchronous, immediate)
  → syncLeadToServer(lead)   ← async, best-effort, never blocks UI
```

Token management:
- `getApiToken()` / `setApiToken()` / `clearApiToken()` — thin wrappers around `localStorage`
- `apiRequest(method, path, body)` — adds `Authorization: Bearer <token>` header, returns `{data, error}` (never throws)
- On startup, `loadApiSession()` validates the stored token via `GET /api/auth/me`; on failure it silently clears the token

Merge strategy on `syncLeadsFromServer()`:
1. Fetch server leads (list endpoint, no snapshots)
2. Build a `Map<id, lead>` from current local leads
3. Add any server leads not present locally (could exist from another device)
4. Push any local leads the server doesn't know about (created offline)
5. Overwrite `leads` array and call `saveLeads()` to persist

---

## 4. Backend Architecture

### 4.1 Server Entry Point & Middleware

`server/index.js` configures:

```
express()
  ├── cors()                    — permissive in dev; should be locked to origin in prod
  ├── express.json({limit:"10mb"})  — 10MB to accommodate base64 snapshots
  ├── /api/auth   → routes/auth.js
  ├── /api/leads  → routes/leads.js
  ├── /api/shades → routes/shades.js
  ├── /api/dealer → routes/dealer.js
  ├── /api/events → routes/events.js
  ├── GET /api/health → {ok, ts}
  └── express.static(../paint-preview-app)   ← serves frontend
      GET * → index.html (SPA fallback)
```

The server listens on `PORT` (default 3001). Serving the frontend from the same origin eliminates CORS entirely.

### 4.2 Authentication — JWT + bcrypt

**Registration:**
1. Validate `shopName`, `email`, `password` (≥6 chars)
2. Check `tenants` table for email uniqueness
3. `bcrypt.hashSync(password, 12)` — 12 salt rounds (~200ms on modern hardware)
4. Insert tenant row with `uuid()` primary key
5. Sign JWT: `{ id, email, shopName }`, 30-day TTL
6. Return `{ token, tenant }`

**Login:**
1. Fetch tenant by email (lowercase normalized)
2. `bcrypt.compareSync(password, hash)` — constant-time comparison
3. On success: sign new JWT, return `{ token, tenant }`

**Request auth middleware (`requireAuth`):**
```
Authorization: Bearer <jwt>
  → jwt.verify(token, JWT_SECRET)
  → attach req.tenant = { id, email, shopName }
  → next()
```

`optionalAuth` follows the same path but calls `next()` on failure (used for `/api/events` so anonymous events can be ingested).

**JWT claims are minimal** (id + email + shopName). All tenant data is fetched fresh from DB when needed via `GET /api/auth/me`.

### 4.3 Database Schema (PostgreSQL)

PostgreSQL replaced SQLite in the Enterprise Edition for horizontal scaling, connection pooling, advanced indexing, and robust JSON/JSONB support. The schema uses `uuid` primary keys, proper foreign key constraints with `ON DELETE CASCADE`, and GIN indexes for full-text search.

**Connection Pool Configuration (`lib/db.js`):**
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum pool size
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000  // Timeout after 2s
});
```

**Migration System:** `node-pg-migrate` handles schema versioning with timestamped migration files.

```sql
-- Multi-tenant identity
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name     VARCHAR(255) NOT NULL,
  dealer_name   VARCHAR(255) DEFAULT '',
  phone         VARCHAR(50) DEFAULT '',
  email         VARCHAR(255) NOT NULL UNIQUE,  -- lowercase normalized
  password_hash VARCHAR(255) NOT NULL,         -- bcrypt, 12 rounds
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tenants_email ON tenants(email);

-- Shade catalog with GIN index for search
CREATE TABLE shades (
  id           VARCHAR(50) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  brand        VARCHAR(100) DEFAULT '',
  collection   VARCHAR(100) DEFAULT '',
  hex          VARCHAR(7) DEFAULT '',
  price_per_l  DECIMAL(10,2) DEFAULT 0,
  color_family VARCHAR(50) DEFAULT '',
  tags         TEXT[] DEFAULT '{}',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_shades_brand ON shades(brand);
CREATE INDEX idx_shades_family ON shades(color_family);
CREATE INDEX idx_shades_search ON shades USING GIN (
  to_tsvector('english', name || ' ' || brand || ' ' || collection || ' ' || color_family)
);

-- Leads with JSONB for flexible schema
CREATE TABLE leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  phone              VARCHAR(50) NOT NULL,
  email              VARCHAR(255) DEFAULT '',
  notes              TEXT DEFAULT '',
  shades_json        JSONB DEFAULT '{}',
  snapshot_b64       TEXT DEFAULT '',
  cost_estimate_json JSONB DEFAULT '{}',
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_created ON leads(tenant_id, created_at);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_shades ON leads USING GIN (shades_json);

-- Events with partitioning support (ready for time-based partitioning)
CREATE TABLE events (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  session_id   VARCHAR(255) DEFAULT '',
  event_type   VARCHAR(50) NOT NULL,
  payload_json JSONB DEFAULT '{}',
  ip_address   INET,
  user_agent   TEXT DEFAULT '',
  ts           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_tenant ON events(tenant_id);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_tenant_ts ON events(tenant_id, ts);
CREATE INDEX idx_events_tenant_type_ts ON events(tenant_id, event_type, ts);
```

### 4.4 API Route Reference

All routes return `application/json`. Error responses: `{ "error": "<message>" }`.

#### Auth (`/api/auth`)

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|--------------|----------|
| POST | `/register` | — | `{shopName, email, password, dealerName?, phone?}` | `{token, tenant}` |
| POST | `/login` | — | `{email, password}` | `{token, tenant}` |
| GET | `/me` | ✓ | — | `{tenant}` |

#### Leads (`/api/leads`)

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|--------------|----------|
| GET | `/` | ✓ | — | `{leads[]}` (no snapshots) |
| POST | `/` | ✓ | `{id?, name, phone, email?, notes?, shades?, snapshotB64?, createdAt?}` | `{lead}` — 201 create / 200 upsert |
| GET | `/:id` | ✓ | — | `{lead}` (includes snapshot) |
| DELETE | `/:id` | ✓ | — | `{ok: true}` |

POST upserts by `id` — if the lead already exists for the tenant, it updates; otherwise inserts. This makes the offline sync idempotent.

#### Shades (`/api/shades`)

| Method | Path | Auth | Query | Response |
|--------|------|------|-------|----------|
| GET | `/` | — | `?q=<search>` | `{shades[], total}` |
| GET | `/:id` | — | — | `{shade}` |

Search is a four-column LIKE across `name`, `brand`, `collection`, `color_family`.

#### Dealer (`/api/dealer`)

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/` | ✓ | — | `{dealer}` |
| PUT | `/` | ✓ | `{shopName, dealerName?, phone?}` | `{dealer}` |

#### Events (`/api/events`)

| Method | Path | Auth | Body / Params | Response |
|--------|------|------|--------------|----------|
| POST | `/` | optional | `{sessionId?, eventType, payload?}` | `{ok, id}` |
| GET | `/summary` | ✓ | — | funnel summary (see §4.5) |
| GET | `/` | ✓ | — | last 500 raw events |

Valid `eventType` values: `session_start`, `shade_selected`, `share_exported`, `contact_opened`, `contact_saved`, `page_load`.

### 4.5 Funnel Analytics Query Design

`GET /api/events/summary` runs five queries against the `events` table and returns a single JSON object:

```json
{
  "period": "30d",
  "sessions": 142,
  "contacts": 38,
  "shares": 51,
  "leads": 35,
  "contactRate": 27,
  "shareRate": 36,
  "avgDecisionMs": 14200,
  "daily": [
    { "day": "2026-06-01", "sessions": 18 },
    { "day": "2026-06-02", "sessions": 24 }
  ]
}
```

**Average decision time** uses a CTE join:
```sql
WITH session_start AS (
  SELECT session_id, ts FROM events WHERE tenant_id=? AND event_type='session_start'
),
first_shade AS (
  SELECT session_id, MIN(ts) as shade_ts FROM events
  WHERE tenant_id=? AND event_type='shade_selected' GROUP BY session_id
)
SELECT AVG(
  EXTRACT(EPOCH FROM (fs.shade_ts - ss.ts)) * 1000
) as avg_ms
FROM session_start ss JOIN first_shade fs ON ss.session_id = fs.session_id
WHERE ss.ts >= datetime('now', '-30 days');
```

PostgreSQL's `EXTRACT(EPOCH FROM interval)` returns seconds; multiplying by 1000 converts to milliseconds.

---

## 5. Data Flows

### 5.1 Image Upload → Wall Mask → Render

```
User selects file
       │
       ▼
handleImageUpload(file)
  FileReader.readAsDataURL
       │
       ▼
  new Image() → onload
  drawImageFit → state.imageRect (letterbox geometry)
  getImageData → state.originalPixels (frozen copy)
  initializeShadesFromImage()
    ├── averageColorSample() → dominant hex
    ├── buildSuggestions()   → state.shades (top 5 from catalog)
    ├── createZone("Wall 1", shades[0].hex)
    └── setActiveShade(shades[0])
  startPilotSession()       → fires session_start event
  setControlsEnabled(true)
       │
       ▼
  drawPreview()
    renderTinted(originalPixels)
      for zone in zones:
        getZoneMask(zone, pixels, sensitivity)
          ├── manualMask? → return it
          └── autoMask?   → compute & cache:
                createAutoMask(pixels, sensitivity)
                  → createCandidatesMap()
                  → growRegionWithColorConstraint()
                  → smoothMask()
        createFeatheredAlphaMask(mask, featherRadius)
        applyTint(data, alphaMask, shadeRgb, opacity, natural)
    putImageData → previewCanvas
```

ML is triggered asynchronously in parallel:
```
ensureMlModel()  (loads once, ~2–4s on first upload)
  → runMlSegmentationForCurrentImage()
  → fuseMasksWithMl(heuristicMask, mlMask)
  → zone.autoMask = fusedMask
  → drawPreview()   (re-renders with improved mask)
```

### 5.2 Lead Capture Flow (Online)

```
User clicks "Contact Dealer"
       │
       ▼
openContactModal()
  → snapshot current canvas to leadSnapshotCanvas (640×360)
  → populate shades summary from zones
  → trackContactOpened()

User fills form → submits
       │
       ▼
captureLeadFromForm(e)
  → build lead object {id, ts, name, phone, email, notes, shades, snapshot}
  → leads.unshift(lead)
  → saveLeads()                 ← localStorage (synchronous)
  → trackContactSaved(lead.id)  ← analytics event
  → syncLeadToServer(lead)      ← async, non-blocking:
       apiRequest("POST", "/api/leads", {...})
       └── if 401/403: silently skip (token expired, user still has local copy)
  → closeContactModal()
  → showTransientToast("Lead saved…")
```

### 5.3 Auth + Session Restore Flow

```
Page load
  │
  ├── loadLeads()          → localStorage → state.leads
  ├── loadAnalytics()      → localStorage → analyticsEvents
  ├── loadDealerSettings() → localStorage → dealerSettings → applyDealerBranding()
  └── loadApiSession()
        → getApiToken()
        → if token:
            apiRequest("GET", "/api/auth/me")
              ├── success: apiTenant = data.tenant → updateServerSyncUI()
              │                                    → syncLeadsFromServer()
              └── 401:    clearApiToken()          → updateServerSyncUI()
```

Login from Settings modal:
```
User types email + password → clicks "Sign In"
       │
       ▼
handleServerAuthSubmit("login")
  → loginToServer(email, password)
       → apiRequest("POST", "/api/auth/login", {email, password})
       → setApiToken(data.token)
       → apiTenant = data.tenant
       → updateServerSyncUI()
       → syncLeadsFromServer()   ← merge server leads into local
  → showTransientToast("Signed in…")
  → closeSettingsModal()
```

### 5.4 Analytics Event Flow

```
User action (e.g., shade click)
       │
       ▼
trackShadeSelected(shade)
  → trackEvent("shade_selected", {hex, name, brand, ttFirstShade})
       ├── push to analyticsEvents[]
       ├── saveAnalytics()          ← localStorage (synchronous, capped at 600)
       └── syncEventToServer(evt)   ← async, best-effort:
                if no token AND no sessionId → skip
                apiRequest("POST", "/api/events", {sessionId, eventType, payload})
                  └── 4xx/network error → silently ignored
```

Local analytics dashboard renders directly from `analyticsEvents[]` without any server call — it works completely offline.

---

## 6. Key Algorithms

### 6.1 Candidate Map Generation

**Problem:** From raw RGBA pixels, identify which pixels *could* be wall (without knowing where the wall is).

**Approach:**
1. **Saturation + brightness gate (`isLikelyWallPixel`):**
   - Walls are typically low-saturation (painted, neutral)
   - `sat = (max(R,G,B) - min(R,G,B)) / max(R,G,B)`
   - Accept if `sat < sensitivity/100` and `40 < brightness < 240`
   - Sensitivity slider (5–60) directly controls the saturation threshold

2. **Texture proxy (luminance gradient):**
   - Per pixel: average absolute luminance delta from its 4-neighbours
   - Global mean texture computed; threshold = `mean × 1.75 + sensitivity × 0.45`
   - High-texture pixels (rugs, art, wood, plants) are excluded

3. **Floor exclusion:**
   - Bottom 26% of image: tighter texture threshold (`× 1.25`) to reject textured floors

4. **3×3 median refinement:**
   - A pixel keeps/gains candidate status based on majority vote in its 3×3 neighbourhood
   - Eliminates isolated noise pixels, closes small gaps

**Complexity:** O(W × H) with constant-factor neighbourhood passes — runs in ~10–30ms for a 1280×720 image in a modern JS engine.

### 6.2 Color-Constrained Flood Fill

**Problem:** Given a candidate map and a seed point, grow a connected wall region without leaking into adjacent objects.

```
BFS queue: [seed]
visited:   Set<index>
seedColor: getPixelColor(pixels, seed.x, seed.y)

while queue not empty:
  pixel = queue.dequeue()
  for each 4-neighbour:
    if visited: continue
    if not candidates[neighbour]: continue
    if rgbDistance²(getPixelColor(neighbour), seedColor) > threshold²: continue
    mark visited
    mask[neighbour] = 1
    queue.enqueue(neighbour)
```

The color-distance threshold is `sensitivity × 2.2` (in RGB space, so ~(55)² at default sensitivity=25). This prevents the fill from crossing sharp color boundaries (e.g., from a beige wall to a brown door frame) even when both pass the saturation gate.

### 6.3 Connected-Component Scoring

After flood-fill, isolated wall patches may remain. Component scoring selects the most plausible wall regions:

```
label each connected component (BFS, new label on each unvisited mask pixel)

for each component C:
  size  = pixel count
  upper = pixels in top 60% of image height
  score = size × (1 + upper / size × 0.8)
                  ↑ upper-wall bias: components that are mostly in the
                    upper half get up to 80% score bonus

keep components where score > 0.12 × max_score
```

The bias exploits the prior that walls dominate the upper half of interior room photos; floors and furniture are lower.

### 6.4 Edge Feathering (Alpha Decay)

**Problem:** Binary masks produce hard edges that look painted-on. Feathering creates a soft transition.

```
alphaMask = Uint8Array(W × H)      // 0–255 per pixel

for each boundary pixel (mask[p]=1 and any 4-neighbour has mask=0):
  mark as boundary

for each mask pixel p:
  dist = BFS distance to nearest boundary pixel   // approximate via 2-pass scan
  alpha = min(255, dist × (255 / featherRadius))
  alphaMask[p] = alpha
```

In practice a two-pass approximation (left-to-right then right-to-left, top-to-bottom then bottom-to-top) computes approximate distances in O(W × H). `featherRadius` comes from the slider (0–8 pixels).

### 6.5 Natural Recolor Blend

The core of the HSL approach (see §3.4) is the lightness preservation:

```
output_l = 0.90 × src_l + 0.10 × target_l
```

At 0.90/0.10: a shadow pixel (src_l = 0.2) on a white wall (target_l = 0.95) stays dark (output_l ≈ 0.275) rather than washing out to near-white. This is what makes the preview look like real paint rather than a Photoshop color fill.

The saturation blend (0.35/0.65) is weighted toward the shade's saturation so the color reads true, while some source saturation is kept to avoid completely flat monochrome regions.

### 6.6 ML + Heuristic Mask Fusion

```
for each pixel p:
  h = heuristic_mask[p]   // 0 or 1
  m = ml_mask[p]           // 0 or 1

  // Default: intersection — high precision
  fused[p] = (h === 1 && m === 1) ? 1 : 0

  // Alternative: union — high recall
  fused[p] = (h === 1 || m === 1) ? 1 : 0
```

Intersection is preferred: DeepLab's "wall" semantic label is precise, and the heuristic texture filter is strong. The heuristic alone can over-segment (includes ceilings, large furniture); DeepLab constrains it. The heuristic catches thin wall strips that DeepLab misses at low resolution.

---

## 7. Storage & Offline-First Design

| Layer | Key | Content | Size limit | Eviction |
|-------|-----|---------|-----------|----------|
| `localStorage` | `paintcrm_leads_v1` | JSON array of lead objects | Browser (~5–10MB) | Manual "Clear all" |
| `localStorage` | `paintcrm_draft_v1` | Downscaled image (JPEG) + zone config | ~150KB per draft | Overwritten on each save; cleared first on quota error |
| `localStorage` | `paintcrm_analytics_v1` | JSON array of events | 600-event cap | Oldest events dropped |
| `localStorage` | `paintcrm_dealer_v1` | `{shopName, dealerName, phone}` | ~100 bytes | Settings form |
| `localStorage` | `paintcrm_api_token_v1` | JWT string | ~200 bytes | Logout / expired |
| Server — PostgreSQL | `leads` table | Full lead rows + base64 snapshot | Disk | Manual delete |
| Server — PostgreSQL | `events` table | Funnel events (append-only) | Disk | No eviction yet |

**Graceful degradation sequence:**
1. No server: app works fully via localStorage alone.
2. Server available, no account: app still uses localStorage; sync layer is dormant.
3. Server available, logged in: localStorage remains primary; server receives async copies.
4. Server unreachable mid-session: `apiRequest` catches network errors, returns `{error}`, UI is unaffected.
5. localStorage full (`QuotaExceededError`): `safeLsSet` removes the draft (largest item) and retries; leads and analytics are preserved.

---

## 8. Security Design

| Concern | Implementation |
|---------|---------------|
| Password storage | bcrypt, cost factor 12 (~150ms per hash — increased for production) |
| Token transport | Bearer JWT in `Authorization` header (never in URL or cookie) |
| Token TTL | 30 days; refresh tokens in roadmap for Phase 6 |
| JWT secret | Environment variable `JWT_SECRET` validated at startup; refuses to start if missing in production |
| SQL injection | 100% parameterised queries via `pg` prepared statements; no string concatenation |
| Tenant isolation | Every leads/events query filters by `tenant_id = req.tenant.id` |
| CORS | Configurable via `ALLOWED_ORIGINS` env var; defaults to permissive only in development |
| Rate limiting | `express-rate-limit`: 100 req/15min per IP; auth endpoints stricter: 10 req/hour |
| Security headers | Helmet.js: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Input validation | Manual field validation in each route; `eventType` whitelisted against a `Set` |
| XSS protection | CSP directives restrict script sources; user content (snapshots) stored as base64, not rendered as HTML |
| Logging | Pino structured logging with automatic PII redaction (passwords, tokens) |
| Container security | Multi-stage Docker build; runs as non-root user (nodejs:1001) |
| Vulnerability scanning | Trivy integrated in CI/CD pipeline; scans dependencies and container image |

**Production Checklist (see OPERATIONS.md):**
- [ ] HTTPS via reverse proxy (nginx/traefik)
- [ ] Database SSL connections enabled
- [ ] Redis password and TLS configured
- [ ] Log aggregation (ELK/Loki) configured
- [ ] Secrets management (Vault/AWS Secrets Manager)
- [ ] Security scanning in CI (Snyk/SonarQube)

---

## 9. Technology Choices & Rationale

### Frontend

| Technology | Alternative considered | Why this choice |
|-----------|----------------------|----------------|
| Vanilla JS (no framework) | React, Vue | Zero build step; open on any device; dealer can modify it; no bundler dependency chain to maintain |
| HTML5 Canvas (2D context) | WebGL, CSS filters | Pixel-level control for masking without GPU setup; `getImageData`/`putImageData` are synchronous; well-understood API |
| TensorFlow.js + DeepLab | Server-side segmentation | Runs fully in-browser; no server needed for ML; GPU via WebGL backend; ~20MB model downloaded once |
| localStorage | IndexedDB | Simpler API for the data volumes involved; no async complexity; sufficient for <600 events and <100 leads |

### Backend (Enterprise Edition)

| Technology | Alternative considered | Why this choice |
|-----------|----------------------|----------------|
| PostgreSQL | SQLite, MongoDB, MySQL | ACID compliance, robust JSONB support, horizontal scaling via read replicas, battle-tested at scale |
| `pg` + `pg-pool` | Knex, Sequelize, Prisma | Direct control over SQL; connection pooling built-in; no ORM overhead for query optimization |
| node-pg-migrate | Knex migrations, Flyway | Native SQL in migration files; no lock-in; works with any PostgreSQL deployment |
| Express.js | Fastify, NestJS | Familiarity; vast middleware ecosystem; easy to incrementally add enterprise features |
| JWT (stateless) | Session cookies, OAuth2 | Stateless auth scales horizontally; no shared session store needed |
| bcrypt (12 rounds) | Argon2, scrypt | Best-known, widely audited; increased from 10 to 12 rounds for production security |
| Helmet.js | Manual header setting | Industry-standard security headers; regularly updated for new threats |
| express-rate-limit | nginx rate limiting | Application-layer control; per-user rules; easier to test and configure |
| Pino | Winston, Bunyan | Fastest JSON logger; built-in redaction; Node.js stream backpressure handling |
| Prometheus + Grafana | Datadog, New Relic | Open-source; no per-host licensing; data stays in your infrastructure |
| Docker + Compose | Kubernetes (initially) | Simplicity for single-server deployment; easy path to K8s when needed |
| GitHub Actions | Jenkins, CircleCI | Native integration; free for public repos; extensive marketplace |

---

## 10. Performance Characteristics

### Frontend

| Operation | Typical time | Notes |
|-----------|-------------|-------|
| Image upload + first render | 80–200ms | Depends on image size; 1280×720 is the canvas target |
| `createCandidatesMap` | 15–40ms | O(W×H), pure JS array operations |
| `growRegionWithColorConstraint` | 5–25ms | BFS; bounded by canvas area |
| `applyTint` (natural mode) | 20–60ms | Per-pixel HSL conversion; hot loop |
| Full `drawPreview` | 40–120ms | Includes all zones + feathering |
| DeepLab segmentation | 1–5s | GPU-accelerated via WebGL; once per image |
| Shade catalog search | <1ms | Linear scan of 63 items |

`drawPreview` is called on every slider move and shade change. At 60fps interactive feel the budget is 16ms — for large images the hot path may need requestAnimationFrame throttling (a Phase 5 improvement).

### Backend

All PostgreSQL queries use parameterized statements via `pg` pool. Typical response times:

| Route | Typical latency |
|-------|----------------|
| `POST /api/auth/login` | 120–150ms (bcrypt 12 rounds dominates) |
| `POST /api/leads` | 5–15ms (connection pool + JSONB insert) |
| `GET /api/leads` | 10–20ms (indexed query) |
| `GET /api/shades` | 5–15ms (GIN index for search) |
| `GET /api/events/summary` | 20–50ms (window functions + indexes) |
| `GET /metrics` | <5ms (Prometheus client in-memory) |

**PostgreSQL Query Performance:**
- Pool size: 20 connections handles ~1000 concurrent users
- Connection acquisition: <2ms with warm pool
- JSONB queries: 5–20ms with GIN indexes
- Analytics aggregation (30-day funnel): 30–80ms with proper indexes

**Docker Resource Usage:**
- App container: ~150MB RAM idle, ~300MB under load
- PostgreSQL: ~200MB base, scales with connection count
- Redis: ~50MB
- Full stack: <1GB RAM for single-node deployment

---

### 4.6 Containerization & Deployment

**Dockerfile Strategy (Multi-stage build):**
```
Stage 1 (builder): npm ci --only=production
Stage 2 (production): Alpine Linux, non-root user, health checks
```

**Security hardening:**
- Runs as `nodejs` user (UID 1001), not root
- `dumb-init` for proper signal handling (PID 1 problem)
- Health check: `curl -f http://localhost:3001/api/health`
- Read-only root filesystem where possible

**docker-compose.yml orchestration:**
```yaml
Services:
  - app: Node.js API (replicas: 1, can scale to 3+)
  - db: PostgreSQL 16 with persistent volume
  - redis: Session cache and rate limiting store
  - prometheus: Metrics scraping (retention: 15 days)
  - grafana: Dashboards with persistent storage
```

**Horizontal scaling path:**
1. Single-node Docker Compose (current) — 1000 users
2. Docker Swarm with overlay networking — 10,000 users
3. Kubernetes with HPA (Horizontal Pod Autoscaler) — 100,000+ users

---

### 4.7 Monitoring & Observability

**Three Pillars:**

**1. Metrics (Prometheus)**
- Custom metrics:
  - `http_request_duration_seconds` — latency histograms by route
  - `http_request_errors_total` — error rate counters
  - `db_query_duration_seconds` — query performance
  - `nodejs_eventloop_lag_seconds` — event loop health
- Infrastructure metrics: CPU, memory, disk (via node_exporter)

**2. Logs (Structured with Pino)**
- Format: JSON with standardized fields (`level`, `time`, `msg`, `req.id`)
- Redaction: Passwords and JWT tokens automatically removed
- Correlation: Request IDs propagate across async operations
- Aggregation: Ready for ELK Stack or Grafana Loki

**3. Health Probes**
- `GET /api/health` — Full check (DB connectivity, response time)
- `GET /api/live` — Liveness (process running, quick response)
- `GET /api/ready` — Readiness (DB ready, can accept traffic)
- Kubernetes integration: Probes used for pod lifecycle management

**Alerting Rules (Prometheus Alertmanager):**
- High error rate (>5% for 2 minutes)
- Slow database queries (p95 > 500ms for 5 minutes)
- High memory usage (>80% for 10 minutes)
- Container restarts (>3 in 10 minutes)

---

### 4.8 CI/CD Pipeline

**GitHub Actions Workflow:**

```yaml
Pipeline Stages:
  1. Lint (ESLint)
  2. Test (Jest with coverage, PostgreSQL service container)
  3. Build (Docker image creation)
  4. Security Scan (Trivy vulnerability scanner)
  5. Deploy Staging (automated on main branch)
  6. Deploy Production (manual approval gate)
```

**Quality Gates:**
- Test coverage: 70% minimum (branches, functions, lines)
- No critical/high vulnerabilities in dependencies
- All migrations must be reversible
- Linting passes with zero errors

**Deployment Strategies:**
- Staging: Rolling update with health checks
- Production: Blue/green deployment or canary (10% traffic, 5-minute observation)
- Rollback: Automatic on health check failure; manual via previous Docker tag

---

## 11. Scalability Path

The current architecture is intentionally single-server, single-DB. The scaling path follows the phase gates in the product plan:

```
Phase 4 (now): PostgreSQL on a single VPS / Docker host
       │  when: > 500 dealers, > 1M events
       ▼
Phase 5: Migrate to PostgreSQL
  - add read replicas; route SELECT queries to replica pool
  - add connection pooling (pg-pool)
  - move snapshot storage to S3 / object storage (strip base64 from DB)
       │  when: multi-region or > 50k req/day
       ▼
Phase 6: Add a read replica for analytics queries
  - write: primary Postgres
  - read (events/summary): replica
  - add Redis for JWT blocklist + rate limit counters
       │  when: team grows, CI/CD required
       ▼
Phase 7: Extract services
  - Analytics service (ClickHouse or BigQuery for event aggregation)
  - Media service (snapshots via presigned S3 URLs)
  - Auth service (dedicated token issuer)
```

The frontend API sync layer is already designed for this: `API_BASE = ""` is the only change needed to point at a different host, and all calls are already idempotent (POST /api/leads upserts by ID).

---

## 12. Testing Strategy

### Frontend E2E (Playwright)

`test-scripts/frontend_e2e_playwright.py` covers:

| Test | What it validates |
|------|-----------------|
| Image upload | File picker triggers, canvas shows image, hint hides |
| Shade suggestion | Swatches rendered after upload |
| Brush paint | Canvas changes color after brush strokes |
| Brush erase | Erased pixels revert toward original |
| Compare mode | Compare canvas appears, slider responds |
| Export | `<a download>` triggered (checked via download intercept) |

Run:
```bash
python3 -m playwright install chromium
python3 test-scripts/frontend_e2e_playwright.py --app-url http://localhost:3001
```

### Backend Testing (Jest + Supertest)

**Unit Tests:**
- `auth.test.js` — Registration, login, token validation, password hashing
- `leads.test.js` — CRUD operations, tenant isolation, JSONB handling

**Integration Test Coverage:**
| Test | What it validates |
|------|-----------------|
| `POST /api/auth/register` | 201, JWT returned, password hashed with bcrypt 12 rounds |
| `POST /api/auth/login` | 200 with valid creds, 401 with invalid |
| `GET /api/auth/me` | Tenant info with valid token, 401 without or expired |
| `POST /api/leads` | Creates lead, stores JSONB, returns 201 |
| `GET /api/leads` | Lists only tenant's leads, proper row-level security |
| `DELETE /api/leads/:id` | Deletes, 404 if not tenant's lead |
| `GET /api/shades` | Search with GIN index, returns all if no query |
| `PUT /api/dealer` | Updates profile, returns updated dealer |
| `POST /api/events` | Validates event type, stores with metadata (IP, UA) |
| `GET /api/events/summary` | Analytics with window functions, 30-day window |

**CI/CD Integration:**
- Tests run in GitHub Actions with PostgreSQL service container
- Coverage reports uploaded to Codecov
- Minimum thresholds: 70% branches, functions, lines, statements

**Load Testing (k6 example):**
```javascript
// tests/load.js
import http from 'k6/http';
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};
export default function () {
  http.get('http://localhost:3001/api/health');
}
```

### Manual QA Checklist (per release)

- [ ] Upload a dark room photo → suggestions auto-apply
- [ ] Tap a wall area → mask updates to tapped zone
- [ ] Add 3 wall tabs → each gets independent color
- [ ] Brush paint a zone → manual mask persists after shade change
- [ ] Undo/redo 5 steps → mask history correct
- [ ] Edge feather slider → soft boundary visible
- [ ] Before/after toggle → original photo shows
- [ ] Compare drag slider → left/right reveal works
- [ ] Export button → PNG downloads
- [ ] Contact Dealer → lead saved, inbox count increments
- [ ] Restore draft → workspace restored on reload
- [ ] Settings → save dealer name → branding appears in hero
- [ ] Settings → Server Sync → register → status chip turns green
- [ ] Capture lead → leads inbox on second device shows it (server sync)
- [ ] Sign out → status chip resets → leads still in local inbox

---

## 13. Phase Roadmap & Architecture Evolution

| Phase | Status | Key architectural addition |
|-------|--------|---------------------------|
| 0 | Done | Product contract — defined scope, no code |
| 1 | Done | Canvas engine, masking pipeline, HSL recolor, ML integration |
| 2 | Done | localStorage persistence, lead CRUD, draft save, shade catalog |
| 3 | Done | Analytics event system, local dashboard, dealer branding |
| 4 | **Done** | PostgreSQL backend with connection pooling, JWT auth, Docker containerization, CI/CD, monitoring stack |
| 5 | **In progress** | Customer CRM (CRUD), site/project model, preview session linked to customer timeline |
| 6 | Planned | Quote → order flow, inventory stock status, credit ledger, payment reminders |
| 7 | Planned | AI palette recommendations (style/mood/season), dealer assistant prompts (LLM) |
| 8 | Future | Contractor assignment, customer-facing app, marketplace mechanics |

**Phase 4 Enterprise Hardening (completed):**
- Database: PostgreSQL with migrations (node-pg-migrate), connection pooling, GIN indexes
- Security: Helmet, rate limiting (Redis-backed when REDIS_URL set), bcrypt 12 rounds, JWT startup guard
- Observability: Prometheus metrics, Grafana dashboards, structured logging (Pino)
- DevOps: Docker multi-stage builds, GitHub Actions CI/CD, vulnerability scanning
- Testing: Jest test suite with 70% coverage threshold, PostgreSQL test database
- Documentation: OPERATIONS.md for deployment and monitoring

**Each phase is gated on metric proof from the previous phase** (per the master plan). Phase 5 starts with ≥3 dealers actively using the backend with repeat sessions, monitored via the new analytics infrastructure.

---

*Last updated: Jul 3, 2026 — Phase 4 complete; Phase 5 next*
