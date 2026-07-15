# Changelog

All notable changes to PaintCRM are documented here.

## Unreleased — 2026-07-16

### Security
- Production requires `ALLOWED_ORIGINS`; CORS no longer silently allows `*`
- Password reset: hashed single-use tokens, expiry, rate limits, generic responses, session revocation
- Tenant defense-in-depth on lead fetch and quote convert updates
- Reminder cron no longer counts WhatsApp click-to-chat as delivered

### Product
- Smart palette picks work for guests (heuristic); OpenAI optional when signed in + configured
- Ledger reminder UI labels honest about WhatsApp / SMS / log-only channels
- Forgot-password + reset flows on `/login`

### Engineering
- Frontend views: `customers`, `quotes`, `inventory`, `ledger`
- Playwright E2E suite under `e2e/` wired into CI (fails build on regression)
- Pure Jest helpers run without Postgres
- MIT license, SECURITY.md, CONTRIBUTING, issue/PR templates
- Docs: tenancy model, security audit, production readiness

### Ops
- Render blueprint branch policy documented
- Env example documents SMTP, password reset, AI, MSG91, cron defaults
