# PaintCRM Operations Guide

This guide covers deployment, monitoring, and maintenance of the PaintCRM application in production environments.

## Table of Contents

1. [Quick Start with Docker](#quick-start-with-docker)
2. [Deployment Options](#deployment-options)
3. [Monitoring & Alerting](#monitoring--alerting)
4. [Database Management](#database-management)
5. [Backup & Recovery](#backup--recovery)
6. [Security Checklist](#security-checklist)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start with Docker

The fastest way to run PaintCRM in production:

```bash
# Clone and enter directory
git clone https://github.com/Brohammad/PaintCRM.git
cd PaintCRM

# Copy environment configuration
cp server/.env.example server/.env
# Edit server/.env with your production values

# Start all services
docker-compose up -d

# Check health
curl http://localhost:3001/api/health
```

This starts:
- **App**: Node.js API server on port 3001
- **Database**: PostgreSQL on port 5432
- **Cache**: Redis on port 6379
- **Metrics**: Prometheus on port 9090
- **Dashboards**: Grafana on port 3000

---

## Deployment Options

### Option 1: Docker Compose (local / single VPS)

**Pros**: Simple, all-in-one, includes Redis + Prometheus + Grafana  
**Best for**: Local prod-like runs, small VPS pilots  
**Manifest**: `docker-compose.yml` at the repo root (there is no separate `docker-compose.prod.yml`)

```bash
# From repo root — set JWT_SECRET and GRAFANA_ADMIN_PASSWORD first
export JWT_SECRET="$(openssl rand -hex 32)"
export GRAFANA_ADMIN_PASSWORD="$(openssl rand -hex 16)"
export ALLOWED_ORIGINS="https://your-domain.example,http://localhost:3001"

docker compose up -d

# View logs
docker compose logs -f app

# Health
curl http://localhost:3001/api/health
```

> Scaling with `docker compose up -d --scale app=N` only works if each app instance shares Postgres + Redis and you put a reverse proxy in front. The default compose file is single-instance oriented.

### Option 2: Render + Neon (current public demo path)

**Pros**: No credit card on free tier; blueprint-driven  
**Manifest**: `render.yaml`  
**Database**: Neon Postgres (`DATABASE_URL`)

```bash
# Dashboard: New → Blueprint → connect this repo
# Paste Neon connection string when prompted for DATABASE_URL
# Ensure ALLOWED_ORIGINS includes your public HTTPS origin(s)
```

Production boot will refuse to start without `JWT_SECRET` (≥32 chars) and `ALLOWED_ORIGINS`.

### Option 3: Fly.io

**Pros**: HTTPS, health checks, region placement  
**Manifest**: `fly.toml` (CI deploy is gated on `FLY_API_TOKEN`)

```bash
fly launch   # once
fly secrets set JWT_SECRET=... ALLOWED_ORIGINS=https://your.app.fly.dev DATABASE_URL=...
fly deploy
```

### Option 4: Other clouds (ECS / GKE / AKS)

PaintCRM is a single Docker image (`server/Dockerfile`) plus managed Postgres. Use any container platform with:

- `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`
- Health: `/api/live` (liveness), `/api/ready` (readiness), `/api/health` (detail)
- Optional: `REDIS_URL` for distributed rate limits, `METRICS_TOKEN` for `/metrics`

Kubernetes manifests are **not** shipped in this repo yet (tracked in BACKLOG). Prefer Compose / Render / Fly until multi-replica demand is real.

---

## Monitoring & Alerting

### Metrics Available

| Metric | Endpoint | Alert Threshold |
|--------|----------|-----------------|
| HTTP Request Rate | `http_request_duration_seconds_count` | > 1000/min |
| HTTP Error Rate | `http_request_errors_total` | > 5% of total |
| Database Query Time | `db_query_duration_seconds` | p95 > 500ms |
| Memory Usage | `nodejs_memory_usage_bytes` | > 80% of limit |
| Event Loop Lag | `nodejs_eventloop_lag_seconds` | > 100ms |

### Grafana Dashboards

Access Grafana at `http://localhost:3000` (admin/admin by default)

Pre-configured dashboards:
- **API Performance**: Request rates, latencies, error rates
- **Database Health**: Connection pool, query times, slow queries
- **System Resources**: CPU, memory, disk usage
- **Business Metrics**: Sign-ups, leads created, funnel conversion

### Setting Up Alerts

```yaml
# alertmanager/alert-rules.yml
groups:
  - name: paintcrm
    rules:
      - alert: HighErrorRate
        expr: rate(http_request_errors_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: DatabaseSlow
        expr: histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
```

---

## Database Management

### Running Migrations

```bash
# Local development
npm run migrate:up

# Docker
docker-compose exec app npm run migrate:up

# Rollback one migration
npm run migrate:down
```

### Database Performance

**Connection Pool Settings**:
```javascript
// Default configuration in lib/db.js
{
  max: 20,                    // Maximum pool size
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000  // Timeout after 2s
}
```

**Monitoring Queries**:
```sql
-- Find slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check active connections
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state;
```

### Read Replicas (Scaling)

When read load becomes high:

```javascript
// lib/db.js - Add read replica support
const readPool = new Pool({
  connectionString: process.env.DATABASE_READ_URL,
  max: 50
});

// Use for analytics queries
export const queryRead = (text, params) => readPool.query(text, params);
```

---

## Backup & Recovery

### Automated Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="paintcrm_backup_$DATE.sql"

# Create backup
docker-compose exec -T db pg_dump -U postgres paintcrm > /backups/$FILENAME

# Compress
gzip /backups/$FILENAME

# Upload to S3 (optional)
aws s3 cp /backups/${FILENAME}.gz s3://paintcrm-backups/

# Keep only last 30 days
find /backups -name "paintcrm_backup_*.gz" -mtime +30 -delete
```

Add to crontab:
```
0 2 * * * /opt/paintcrm/backup.sh >> /var/log/paintcrm-backup.log 2>&1
```

### Point-in-Time Recovery

```bash
# Restore from backup
zcat paintcrm_backup_20240607.sql.gz | docker-compose exec -T db psql -U postgres

# Or with pg_restore for custom format
pg_restore -h localhost -U postgres -d paintcrm paintcrm_backup.dump
```

### Disaster Recovery Plan

| Scenario | Recovery Time | Steps |
|----------|----------------|-------|
| Single container crash | < 1 min | Docker auto-restart |
| Database corruption | < 30 min | Restore from backup + replay WAL |
| Full server failure | < 2 hours | Provision new server, restore backups |
| Region outage | < 4 hours | Activate standby in secondary region |

---

## Security Checklist

### Pre-Production Checklist

- [ ] Set `JWT_SECRET` to 32+ random characters (production boot fails without it)
- [ ] Set `ALLOWED_ORIGINS` to your public HTTPS origin(s) (production boot fails if unset)
- [ ] Set `APP_PUBLIC_URL` to the public HTTPS origin (password-reset email links)
- [ ] Configure `SMTP_*` + `FROM_EMAIL` so password-reset emails actually send (otherwise production logs a warning and skips send)
- [ ] Enable HTTPS (use reverse proxy like nginx/traefik, or Fly/Render termination)
- [ ] Confirm CORS allowlist does **not** include `*` unless intentionally public
- [ ] Enable rate limiting (already enabled by default; set `REDIS_URL` for multi-instance)
- [ ] Review and tighten CSP headers in helmet config
- [ ] Enable database SSL connections
- [ ] Set up log aggregation (ELK/Loki)
- [ ] Configure security scanning (Trivy/Snyk)
- [ ] Enable 2FA for database access
- [ ] Rotate database credentials
- [ ] Review and remove any test data
- [ ] Set up log retention policy (GDPR compliance)

### Nginx Reverse Proxy Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name api.paintcrm.example;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Troubleshooting

### Common Issues

**Database Connection Pool Exhausted**
```
Error: sorry, too many clients already
```
**Solution**: Increase `max` in pool config or add connection pooling (PgBouncer)

**High Memory Usage**
```bash
# Check memory usage
docker stats paintcrm-app-1

# Heap dump for analysis
node --heapsnapshot-near-heap-limit=3 index.js
```

**Slow Queries**
```sql
-- Enable query logging
ALTER DATABASE paintcrm SET log_min_duration_statement = 1000;

-- Check for missing indexes
SELECT schemaname, tablename, attname, n_tup_read, n_tup_fetch
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_tup_read DESC;
```

**Container Won't Start**
```bash
# Check logs
docker-compose logs app

# Check environment
docker-compose exec app env

# Verify database connection
docker-compose exec app node -e "require('./lib/db').checkHealth().then(console.log)"
```

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /api/health` | Full system health | `200` with DB status |
| `GET /api/live` | Container alive | `200` {alive: true} |
| `GET /api/ready` | Ready to serve traffic | `200` {ready: true} |
| `GET /metrics` | Prometheus metrics | Text format metrics |

### Password reset not emailing

1. Confirm `APP_PUBLIC_URL` matches the public HTTPS origin
2. Confirm `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` are set
3. In development without SMTP, the reset URL is printed to the server console (`[password-reset]`)
4. API always returns a generic success message — this is intentional (no email enumeration)

### Browser E2E locally

See [`e2e/README.md`](e2e/README.md). CI runs Playwright after unit tests and fails the pipeline on regression.

### Manual overdue SMS job (ops only)

```bash
# Requires auth + MSG91_AUTH_KEY. Without MSG91 the job skips (does not open WhatsApp links).
curl -X POST "$APP_URL/api/ledger/reminders/run-overdue" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Keep `ENABLE_REMINDER_CRON=false` unless MSG91 is production-ready.

---

## Support

For production issues:

1. Check logs: `docker compose logs -f app`
2. Review metrics: `http://localhost:9090`
3. Check dashboards: `http://localhost:3000`
4. File an issue: https://github.com/Brohammad/PaintCRM/issues

---

*Last updated: July 2026*
