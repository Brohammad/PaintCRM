# Production readiness report

Last validated: **2026-07-16**

## Repository health

| Area | Grade | Notes |
|------|-------|-------|
| Backend structure | A | routes → libs → pg; migrations 001–011 |
| Frontend structure | B+ | Views extracted (customers, quotes, inventory, ledger); canvas still in `script.js` |
| Tests | A− | Jest API + Vitest units + Playwright E2E in CI |
| Docs honesty | A | OPERATIONS/ARCHITECTURE aligned; no phantom K8s |
| OSS | A | MIT, SECURITY, CONTRIBUTING, issue templates |

## Trust report

Dealers can: register, reset password, preview shades offline, sync leads, quote → order, track inventory, log/send reminders (WhatsApp chat / optional SMS).  
Nothing visible claims WhatsApp Cloud auto-send or staff RBAC. Cron defaults **off**.

## Security report

See [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md). Critical CORS + password reset closed. Tenancy is app-level with documented RLS path.

## Deployment report

| Target | Status |
|--------|--------|
| Docker multi-stage | Ready (`server/Dockerfile`) |
| Compose (app+db+redis+metrics) | Ready (`docker-compose.yml`) |
| Render + Neon | Ready (`render.yaml`); branch policy documented |
| Fly.io | Ready (`fly.toml`); CI gated on token |
| Health | `/api/live`, `/api/ready`, `/api/health` |
| Metrics | `/metrics` (+ optional `METRICS_TOKEN`) |
| Backups | Operator-owned (Neon PITR / `pg_dump` runbook in OPERATIONS) |

## Performance report (measured locally)

| Signal | Value | Action |
|--------|-------|--------|
| Vite JS bundle | ~106 kB / ~31 kB gzip | OK for dealer demos |
| CSS | ~21 kB / ~5 kB gzip | OK |
| Hot path | Canvas tint on main thread | Acceptable; profile before optimizing |
| List APIs | Paginated (max 200) | OK |

No speculative caching layered on — optimize only after real p95 data.

## Developer experience

- Pure Jest helpers run without Postgres
- `e2e/README.md` for Playwright
- `CONTRIBUTING.md` + BACKLOG for scope control
- ESLint on server; frontend lint still open (P2)

## Product experience

| Flow | Friction remaining |
|------|--------------------|
| First login | Guest bypass + `/login` — clear |
| Password forgotten | Reset on `/login` |
| Lead capture | Works offline + sync |
| Quote → order | Server totals; convert one click |
| Reminders | WhatsApp needs human confirmation (honest) |
| Staff | Single user per shop — P2 |

## Technical debt

1. Canvas/decision engine still lives in `script.js` (~2.7k LOC) — extract further as needed
2. Client `palette.js` vs server `heuristic.js` duplication
3. App-level tenancy without RLS
4. Legacy Python `test-scripts/` superseded by `e2e/` (keep or delete later)

## Startup readiness

**Would a dealer pay for a pilot?** Yes for the decision engine + quote/ledger loop, if onboarding is assisted.  
**What still creates doubt?** No staff seats, SMS needs MSG91+DLT, no mobile-native app.  
**Support reducers shipped:** password reset, honest reminder labels, health checks, E2E CI.

## Resume / interview readiness

Demonstrates: multi-tenant commerce integrity, refresh-token security, offline-first UX, Docker/CI/E2E, ledger concurrency, production boot guards.

## Open source readiness

MIT licensed; SECURITY.md; CONTRIBUTING; issue/PR templates. Changelog/releases = P2.

## CI matrix

`lint` → `test` + `frontend` → `e2e` → `build` (main) → Trivy → Fly deploy (optional secrets).
