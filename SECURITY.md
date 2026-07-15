# Security Policy

## Supported versions

Security fixes are applied to the default branch (`main`) and to the currently deployed production branch.

| Version / branch | Supported |
|------------------|-----------|
| `main` | ✅ |
| Latest tagged release | ✅ |
| Older feature branches | ❌ |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, email **brohammad** via the contact listed on the [GitHub profile](https://github.com/Brohammad) or open a private [GitHub Security Advisory](https://github.com/Brohammad/PaintCRM/security/advisories/new) on this repository.

Include:

1. Description of the issue and impact
2. Steps to reproduce (PoC if possible)
3. Affected commit / deploy URL if known

You can expect an acknowledgement within a few days. Please give us a reasonable window to patch before public disclosure.

## Security posture (high level)

- Passwords: bcrypt (cost 12); reset via single-use hashed tokens (see `docs/SECURITY_AUDIT.md`)
- Sessions: short-lived JWT access tokens + rotating refresh tokens (SHA-256 hashed at rest) with reuse detection
- Production boot guards: `JWT_SECRET` (≥32 chars) and `ALLOWED_ORIGINS` required
- Transport hardening: Helmet CSP, CORS allowlist, rate limiting (Redis-backed when configured)
- Data access: parameterized SQL; tenant-scoped queries at the application layer (`docs/TENANCY.md`)
- CI: Trivy + Playwright E2E (including tenant isolation)

Known residual risks (tracked in [`BACKLOG.md`](BACKLOG.md) as P2+): Postgres RLS not yet enabled, JWTs in `localStorage`, CSP `'unsafe-inline'` for static HTML auth bootstrap, no staff RBAC.
