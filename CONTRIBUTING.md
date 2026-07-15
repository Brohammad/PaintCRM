# Contributing to PaintCRM

Thanks for helping improve PaintCRM. This project is a paint decision engine plus a multi-tenant dealer CRM — keep changes focused on real dealer/customer value.

## Before you start

1. Read [`README.md`](README.md) for product context and quick start.
2. Skim [`ARCHITECTURE.md`](ARCHITECTURE.md) for auth, tenancy, and data-flow constraints.
3. Check [`BACKLOG.md`](BACKLOG.md) so you don't duplicate (or fight) prioritized work.

## Development setup

```bash
# Backend
cd server
cp .env.example .env
# Start Postgres (Docker Compose from repo root is easiest)
npm install
npm run migrate:up
npm test
npm run dev

# Frontend (optional Vite HMR)
cd ../paint-preview-app
npm install
npm test
npm run dev
```

Full stack with monitoring:

```bash
docker compose up -d
curl http://localhost:3001/api/health
```

## How we work

- **Small PRs** that do one thing. Prefer incremental refactors over rewrites.
- **Tests first for behavior changes.** Backend: Jest + Supertest. Frontend pure modules: Vitest.
- **Tenant isolation is sacred.** Every tenant-owned query must filter `tenant_id`.
- **Server computes money.** Never trust client-side quote/order/ledger totals.
- **No drive-by features.** If it isn't in BACKLOG P0/P1 (or a clear bugfix), open an issue first.
- **Docs follow code.** If you change auth, deploy, or API contracts, update README / ARCHITECTURE / OPERATIONS in the same PR.

## PR checklist

- [ ] `cd server && npm test` (needs Postgres — see `TEST_DATABASE_URL`)
- [ ] `cd paint-preview-app && npm test && npm run build`
- [ ] `cd server && npm run lint`
- [ ] No secrets committed (`.env`, keys, tokens)
- [ ] New env vars documented in `server/.env.example`
- [ ] User-facing change mentioned in the PR description

## Reporting bugs / proposing features

Use the GitHub issue templates. For security issues, follow [`SECURITY.md`](SECURITY.md) — do not file a public issue.

## Code style

- Server: CommonJS, Express route → `lib/` domain helpers → `pg`.
- Frontend: ES modules under `paint-preview-app/src/`; keep `script.js` as wiring, not new business logic.
- Prefer clear names over clever abstractions.
