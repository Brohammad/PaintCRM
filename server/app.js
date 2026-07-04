const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const path = require('path');

const { register, httpRequestDuration, httpRequestErrors } = require('./lib/metrics');

const app = express();

// Trust the first proxy hop (required for correct req.ip behind nginx / load balancers)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

app.use(compression());

// Rate limiting — uses Redis when REDIS_URL is set, falls back to in-memory
const rateLimitingEnabled = process.env.ENABLE_RATE_LIMITING !== 'false';

function buildStore(windowMs, prefix) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return undefined; // express-rate-limit defaults to MemoryStore

  try {
    const Redis = require('ioredis');
    const client = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
    const windowSeconds = Math.ceil(windowMs / 1000);

    return {
      async increment(key) {
        const rk = prefix + key;
        const pipeline = client.pipeline();
        pipeline.incr(rk);
        pipeline.expire(rk, windowSeconds, 'NX');
        pipeline.pttl(rk);
        const [[, count], , [, pttl]] = await pipeline.exec();
        const resetTime = pttl > 0
          ? new Date(Date.now() + pttl)
          : new Date(Date.now() + windowSeconds * 1000);
        return { totalHits: count, resetTime };
      },
      async decrement(key) { await client.decr(prefix + key); },
      async resetKey(key) { await client.del(prefix + key); },
    };
  } catch {
    return undefined;
  }
}

if (rateLimitingEnabled) {
  const apiWindowMs = 15 * 60 * 1000;
  const limiter = rateLimit({
    windowMs: apiWindowMs,
    max: process.env.NODE_ENV === 'test' ? 1000 : 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore(apiWindowMs, 'rl:api:'),
  });
  app.use('/api/', limiter);

  const authWindowMs = 60 * 60 * 1000;
  const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    skipSuccessfulRequests: true,
    store: buildStore(authWindowMs, 'rl:auth:'),
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
}

// Structured logging
const logger = pinoHttp({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.body.password'],
    remove: true,
  },
});
app.use(logger);

// HTTP metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    if (res.statusCode >= 400) {
      httpRequestErrors.inc({ method: req.method, route, status_code: res.statusCode });
    }
  });
  next();
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request timeout
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/shades', require('./routes/shades'));
app.use('/api/dealer', require('./routes/dealer'));
app.use('/api/events', require('./routes/events'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));

// Health probes
app.get('/api/health', async (req, res) => {
  const { checkHealth } = require('./lib/db');
  const dbHealth = await checkHealth();
  res.status(dbHealth.healthy ? 200 : 503).json({
    status: dbHealth.healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.1.0',
    database: dbHealth.healthy ? 'connected' : 'disconnected',
  });
});

app.get('/api/ready', async (req, res) => {
  const { checkHealth } = require('./lib/db');
  const dbHealth = await checkHealth();
  res.status(dbHealth.healthy ? 200 : 503).json({ ready: dbHealth.healthy });
});

app.get('/api/live', (req, res) => {
  res.status(200).json({ alive: true });
});

// Prometheus metrics — optionally protected by METRICS_TOKEN
app.get('/metrics', async (req, res) => {
  if (process.env.ENABLE_METRICS === 'false') {
    return res.status(404).end();
  }
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (provided !== metricsToken) {
      return res.status(401).end();
    }
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Static frontend files
const FRONTEND_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '../paint-preview-app');
app.use(express.static(FRONTEND_DIR));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Error handler
app.use((err, req, res, _next) => {
  req.log?.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = app;
