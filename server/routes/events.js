const express = require("express");
const db = require("../db");
const { optionalAuth } = require("../middleware/auth");

const router = express.Router();
router.use(optionalAuth);

const VALID_TYPES = new Set([
  "session_start",
  "shade_selected",
  "share_exported",
  "contact_opened",
  "contact_saved",
  "page_load",
]);

// POST /api/events — record a funnel analytics event
router.post("/", (req, res) => {
  const { sessionId, eventType, payload } = req.body || {};

  if (!eventType) return res.status(400).json({ error: "eventType is required" });
  if (!VALID_TYPES.has(eventType))
    return res.status(400).json({ error: `Unknown event type. Valid: ${[...VALID_TYPES].join(", ")}` });

  const tenantId = req.tenant ? req.tenant.id : null;
  const payloadJson = payload ? JSON.stringify(payload) : null;

  const result = db.prepare(`
    INSERT INTO events (tenant_id, session_id, event_type, payload_json)
    VALUES (?, ?, ?, ?)
  `).run(tenantId, sessionId || null, eventType, payloadJson);

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// GET /api/events/summary — funnel analytics summary (requires auth)
router.get("/summary", (req, res) => {
  if (!req.tenant) return res.status(401).json({ error: "Auth required for summary" });

  const tenantId = req.tenant.id;

  // Sessions in last 30 days
  const sessions = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as count
    FROM events WHERE tenant_id = ? AND event_type = 'session_start'
      AND ts >= datetime('now', '-30 days')
  `).get(tenantId);

  // Contact rate = contact_saved / session_start (30d)
  const contacts = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as count FROM events
    WHERE tenant_id = ? AND event_type = 'contact_saved'
      AND ts >= datetime('now', '-30 days')
  `).get(tenantId);

  // Share rate
  const shares = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE tenant_id = ? AND event_type = 'share_exported'
      AND ts >= datetime('now', '-30 days')
  `).get(tenantId);

  // Avg decision time (ms) from session_start to first shade_selected per session
  const decisionRows = db.prepare(`
    WITH session_start AS (
      SELECT session_id, ts FROM events
      WHERE tenant_id = ? AND event_type = 'session_start'
    ),
    first_shade AS (
      SELECT session_id, MIN(ts) as shade_ts FROM events
      WHERE tenant_id = ? AND event_type = 'shade_selected'
      GROUP BY session_id
    )
    SELECT AVG(
      CAST((julianday(fs.shade_ts) - julianday(ss.ts)) * 86400000 AS INTEGER)
    ) as avg_ms
    FROM session_start ss JOIN first_shade fs ON ss.session_id = fs.session_id
    WHERE ss.ts >= datetime('now', '-30 days')
  `).get(tenantId, tenantId);

  // 7-day session bar chart (date → count)
  const daily = db.prepare(`
    SELECT date(ts) as day, COUNT(DISTINCT session_id) as sessions
    FROM events WHERE tenant_id = ? AND event_type = 'session_start'
      AND ts >= datetime('now', '-7 days')
    GROUP BY date(ts) ORDER BY day
  `).all(tenantId);

  // Total leads count
  const leadsCount = db.prepare("SELECT COUNT(*) as count FROM leads WHERE tenant_id = ?").get(tenantId);

  const sessionCount = sessions.count;
  const contactCount = contacts.count;
  const shareCount = shares.count;

  res.json({
    period: "30d",
    sessions: sessionCount,
    contacts: contactCount,
    shares: shareCount,
    leads: leadsCount.count,
    contactRate: sessionCount > 0 ? Math.round((contactCount / sessionCount) * 100) : 0,
    shareRate: sessionCount > 0 ? Math.round((shareCount / sessionCount) * 100) : 0,
    avgDecisionMs: decisionRows.avg_ms ? Math.round(decisionRows.avg_ms) : null,
    daily,
  });
});

// GET /api/events — raw events list (auth required, last 500)
router.get("/", (req, res) => {
  if (!req.tenant) return res.status(401).json({ error: "Auth required" });

  const rows = db.prepare(`
    SELECT id, session_id, event_type, payload_json, ts
    FROM events WHERE tenant_id = ?
    ORDER BY ts DESC LIMIT 500
  `).all(req.tenant.id);

  res.json({
    events: rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      eventType: r.event_type,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      ts: r.ts,
    })),
  });
});

module.exports = router;
