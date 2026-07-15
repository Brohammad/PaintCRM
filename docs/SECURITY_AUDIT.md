# Security audit (2026-07-16)

Scope: Express API, Vite frontend, auth lifecycle, multi-tenancy, deploy defaults.

## Findings & disposition

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| S1 | High | Production CORS defaulted to `*` when `ALLOWED_ORIGINS` unset | **Fixed** — boot refuses; cross-origin denied |
| S2 | Medium | Password reset missing | **Fixed** — hashed tokens, TTL, generic responses, rate limits |
| S3 | Medium | Convention-only tenant isolation | **Documented** + defense-in-depth filters; RLS path in `docs/TENANCY.md` |
| S4 | Medium | JWT in `localStorage` + CSP `unsafe-inline` | **Accepted** for SPA stage; HttpOnly cookies = P2 |
| S5 | Low | Reminder cron counted WhatsApp click-to-chat as “sent” | **Fixed** — cron requires MSG91 SMS |
| S6 | Low | SMTP env advertised before implementation | **Fixed** — wired to password reset |
| S7 | Info | No RBAC / staff seats | **Deferred** P2 — single dealer identity per tenant |
| S8 | Info | OptionalAuth on events + AI recommend | **Accepted** — public funnel + heuristic palette; no tenant data returned without auth |
| S9 | Info | MSG91 key in query string | **Accepted** — provider API shape; avoid logging full URLs |

## OWASP Top 10 (condensed)

| Category | Assessment |
|----------|------------|
| A01 Broken access control | Tenant filters + auth middleware; E2E isolation test |
| A02 Cryptographic failures | bcrypt 12; refresh/reset hashes only; JWT secret boot guard |
| A03 Injection | Parameterized `pg` queries throughout |
| A04 Insecure design | Server-computed money totals; append-only ledger |
| A05 Security misconfiguration | Helmet CSP, CORS allowlist, rate limits, Trivy in CI |
| A06 Vulnerable components | Trivy FS scan in CI |
| A07 Auth failures | Refresh rotation + reuse detection; password reset; rate limits on auth |
| A08 Data integrity | Ledger `FOR UPDATE`; quote totals recomputed server-side |
| A09 Logging failures | Pino with auth/password/token redaction; reset audit events |
| A10 SSRF | No user-controlled server-side fetch URLs (OpenAI fixed endpoint) |

## Residual risks (P2+)

- HttpOnly session cookies / BFF
- Postgres RLS
- Account lockout beyond rate limit
- MFA
- India DLT-compliant SMS templates for production MSG91

## Secrets

Never commit `.env`. Production requires `JWT_SECRET` (≥32) and `ALLOWED_ORIGINS`. Optional: `SMTP_*`, `MSG91_*`, `OPENAI_API_KEY`, `REDIS_URL`, `METRICS_TOKEN`.
