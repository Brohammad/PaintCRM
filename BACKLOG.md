# PaintCRM — Prioritized Improvement Backlog

Last reviewed: **2026-07-16** (post P0/P1 completion cycle).

**Status: no open P0 or P1 items.** Remaining work is P2/P3 only.

Scoring: Impact / Difficulty / Risk = Low · Med · High

---

## Completed this cycle (closed P0 / P1)

| ID | Item | Outcome |
|----|------|---------|
| P0-1 | Production CORS harden | Done |
| P0-2 | Docs honesty | Done |
| P0-3 | OSS scaffolding (LICENSE, SECURITY, CONTRIBUTING, templates) | Done |
| P0-4 | Finish/hide WIP (AI palette, reminders, cron honesty) | Done |
| P0-5 | Tenant filter defense-in-depth | Done |
| P1-1 | Frontend view extraction (customers, quotes, inventory, ledger) | Done |
| P1-2 | Playwright E2E in CI | Done |
| P1-3 | Password reset | Done |
| P1-4 | Tenancy audit + docs + RLS path | Done (docs; RLS deferred P2) |
| P1-5 | Pure Jest without Postgres | Done |
| P1-7 | Render branch policy | Done |

See [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) for the full audit.

---

## P2 — Nice improvements

| ID | Improvement | Why | Impact | Diff | Risk |
|----|-------------|-----|--------|------|------|
| P2-1 | Multi-user per tenant (owner / staff) with basic RBAC | Real shops have more than one counter person | High | High | Med |
| P2-2 | WhatsApp Business Cloud API (true outbound) | Beyond click-to-chat | High | High | Med |
| P2-3 | HttpOnly cookie session / BFF | Reduce XSS token theft | Med | High | Med |
| P2-4 | CHANGELOG + semver release tags | OSS / portfolio hygiene | Med | Low | Low |
| P2-5 | Postgres RLS rollout (per `docs/TENANCY.md`) | DB-enforced isolation | High | High | Med |
| P2-6 | Frontend ESLint in CI | Catch XSS/`innerHTML` early | Med | Low | Low |
| P2-7 | Further extract canvas engine from `script.js` | Maintainability | Med | Med | Med |
| P2-8 | Deduplicate client `palette.js` ↔ server `heuristic.js` | One ranking model | Low | Med | Low |
| P2-9 | Neon/Fly backup restore drill documented + scheduled | Operator confidence | Med | Low | Low |
| P2-10 | In-app first-run checklist (photo → lead → quote) | Reduce support | Med | Med | Low | **Done** | **Done** |
| P2-11 | OpenAPI `/api/docs` | Integrator DX | Med | Med | Low |
| P2-12 | Remove or archive legacy Python `test-scripts/` | Less confusion vs `e2e/` | Low | Low | Low |
| P2-13 | India DLT / MSG91 template compliance for SMS | Legal SMS in production | High | Med | Med |

---

## P3 — Future (after retention / payment proof)

| ID | Idea | Gate |
|----|------|------|
| P3-1 | Contractor assignment / job tracking | Dealers use quotes+ledger weekly |
| P3-2 | Customer-facing share link (view-only preview) | Share-rate metric justifies it |
| P3-3 | Marketplace / multi-dealer ranking | Post-monetization |
| P3-4 | True 3D / VR preview | Masking accuracy “good enough” in-store |
| P3-5 | MFA / passkeys | Enterprise pilot demand |
| P3-6 | Dealer AI assistant for quoting copy | After palette recommend proves usage |

---

## Explicitly out of scope until evidence

- Full CRM suite rewrite
- Speculative microservices
- Kubernetes manifests (Compose / Render / Fly are the supported paths)
- Fake “enterprise” features that over-promise
