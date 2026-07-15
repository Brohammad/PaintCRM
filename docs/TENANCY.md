# Multi-tenancy model

PaintCRM is a **multi-tenant SaaS** where each dealer account is a `tenants` row. One login = one shop. There are no staff seats or roles yet (see BACKLOG P2).

## How isolation works today

| Layer | Mechanism |
|-------|-----------|
| Auth | JWT access token carries `tenant.id`; `requireAuth` loads the tenant and attaches `req.tenant` |
| Queries | Application code filters `tenant_id = req.tenant.id` on every tenant-owned read/write |
| Document numbers | Per-tenant sequences for quotes/orders |
| Refresh sessions | `refresh_tokens.tenant_id`; logout-all revokes one tenant’s sessions |
| Password reset | Tokens scoped to `tenant_id`; success revokes that tenant’s refresh tokens |

**Global (not tenant-scoped):** shade catalog (`shades`), health/metrics endpoints.

## What we audited

Defense-in-depth passes were added for:

- Post-write lead fetch (`SELECT … AND tenant_id`)
- Quote convert update (`UPDATE quotes … AND tenant_id`)

E2E `tenant-isolation.spec.js` registers two dealers and asserts dealer B cannot see dealer A’s customer in the UI.

## Convention-only enforcement (honest residual risk)

Isolation is **not** enforced by Postgres Row Level Security (RLS). A missed `tenant_id` filter in new code could leak data. Mitigations:

1. Code review checklist: every SQL touching tenant tables must include `tenant_id`
2. Integration tests that create two tenants and expect 404 cross-access (quotes, ledger, leads, customers)
3. Future: RLS (below)

## Future path: Postgres RLS (no rewrite required)

Incremental migration — **do not** rewrite the app first:

1. Create a `SET LOCAL app.tenant_id = '<uuid>'` helper used at the start of each request transaction
2. Enable RLS on tenant tables with policy: `tenant_id = current_setting('app.tenant_id')::uuid`
3. Keep existing app filters (defense in depth)
4. Roll out table-by-table: customers → leads → quotes/orders → inventory → ledger
5. Add a CI smoke that fails if a query returns rows when `app.tenant_id` is unset

Until RLS ships, treat every new route as a tenancy security review item.
