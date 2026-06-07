# Paint Intelligence Platform

A paint decision engine that helps customers choose a wall color confidently in under 60 seconds. Built for in-store dealer demos — upload a room photo, preview shades live on the walls, compare side by side, capture a lead, and export a package for dealer follow-up.

## What's in this repo

| Path | Description |
|------|-------------|
| `paint-preview-app/` | Main app — static HTML/CSS/JS, runs in any browser with no build step |
| `paint-preview-app/react-canvas-component/` | Reusable React/Next.js component extracting the same canvas logic |
| `test-scripts/` | Playwright E2E tests and backend smoke test scaffolding |
| `master-plan.txt` | Phase roadmap from Decision Engine through CRM platform |

## Running locally

```bash
cd paint-preview-app
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). No install, no build.

## Features

### Phase 1 — Decision Engine (shipped)

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

### Phase 2 — Conversion Layer (in progress)

- **Contact Dealer** — after finishing a preview, capture customer name, phone, optional email + notes, the chosen shade for each wall zone, and a live snapshot of the current preview
- **Local Leads Inbox** — all captured leads are persisted in the browser (no server required); view the full list, browse by customer, open detail view
- **Lead detail view** — snapshot image, full customer info, exact per-wall shade breakdown (name + hex)
- **Lead package export** — one click downloads the snapshot PNG + a structured `.json` sidecar (ISO timestamp, customer fields, shades per wall) — ready to email, print, or import into a real CRM
- **Delete leads** — remove individual leads from the local inbox
- **Session draft save / restore** — the current workspace (image + wall color choices) is automatically saved as you work; a "Restore draft" button appears on fresh loads so you can resume a customer session without re-uploading

## User flow (demo script)

1. Open the app and upload a room photo.
2. The app auto-suggests 5 matching shades and applies the first one to the walls.
3. Adjust: switch shades, add wall tabs for separate zones, use brush or tap-to-select for precise masking, toggle before/after, drag the compare slider.
4. Click **Contact Dealer** — fill in the customer's name and phone (10 seconds), hit Save Lead.
5. The lead appears in the **Leads** inbox with a thumbnail.
6. Open the lead → **Export Package** → the dealer gets a PNG + JSON ready for follow-up.

## Running tests

```bash
pip install -r test-scripts/requirements.txt
python3 -m playwright install chromium

# Start the app server first, then:
python3 test-scripts/frontend_e2e_playwright.py --app-url http://localhost:8080
```

The E2E suite covers: image upload, brush paint, brush erase, compare mode, and export.

## React component

`paint-preview-app/react-canvas-component/` contains a self-contained `WallRecolorCanvas.tsx` component and `pixelUtils.ts` you can copy into any React/Next.js project. See the [component README](paint-preview-app/react-canvas-component/README.md) for integration steps.

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | Done | Product contract — scope, flow, success metrics |
| 1 | Done | Decision Engine — masking, recolor, compare, share |
| 2 | In Progress | Conversion layer — Contact Dealer form, lead capture, local inbox, session drafts |
| 3 | Planned | Pilot validation — 3–5 dealers, real usage metrics |
| 4 | Planned | Backend foundation — auth, lead APIs, shade catalog |
| 5+ | Future | CRM Lite, quoting, inventory, AI recommendations |

See [`master-plan.txt`](master-plan.txt) for the full execution plan with sprint breakdowns and success metrics.
