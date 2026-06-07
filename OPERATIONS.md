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

### Option 1: Docker Compose (Recommended for Single Server)

**Pros**: Simple, all-in-one, includes monitoring
**Best for**: Small to medium deployments, single team

```bash
# Production start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f app

# Scale to multiple instances
docker-compose up -d --scale app=3
```

### Option 2: Kubernetes

**Pros**: Auto-scaling, rolling updates, high availability
**Best for**: Large deployments, multiple teams

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paintcrm-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: paintcrm
  template:
    metadata:
      labels:
        app: paintcrm
    spec:
      containers:
      - name: app
        image: paintcrm:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: paintcrm-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /api/live
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Option 3: Cloud Platform (AWS/GCP/Azure)

**AWS Example with ECS**:

```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker build -t paintcrm ./server
docker tag paintcrm:latest $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/paintcrm:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/paintcrm:latest

# Deploy with ECS Fargate
aws ecs update-service --cluster paintcrm --service app --force-new-deployment
```

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

- [ ] Change default JWT_SECRET to 32+ random characters
- [ ] Enable HTTPS (use reverse proxy like nginx/traefik)
- [ ] Set secure CORS origins (not `*`)
- [ ] Enable rate limiting (already enabled by default)
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

---

## Support

For production issues:

1. Check logs: `docker-compose logs -f app`
2. Review metrics: `http://localhost:9090`
3. Check dashboards: `http://localhost:3000`
4. File an issue: https://github.com/Brohammad/PaintCRM/issues

---

*Last updated: June 2026*
