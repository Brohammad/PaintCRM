const express = require("express");
const { query } = require("../lib/db");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const VALID_TYPES = new Set([
  "session_start",
  "shade_selected",
  "share_exported",
  "contact_opened",
  "contact_saved",
  "page_load",
]);

// POST /api/events — record a funnel analytics event
router.post("/", optionalAuth, async (req, res, next) => {
  try {
    const { sessionId, eventType, payload } = req.body || {};

    if (!eventType) {
      return res.status(400).json({ error: "eventType is required" });
    }
    
    if (!VALID_TYPES.has(eventType)) {
      return res.status(400).json({ 
        error: `Unknown event type. Valid: ${[...VALID_TYPES].join(", ")}` 
      });
    }

    const tenantId = req.tenant ? req.tenant.id : null;
    const payloadJson = JSON.stringify(payload || {});
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "";

    const result = await query(
      `INSERT INTO events (tenant_id, session_id, event_type, payload_json, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [tenantId, sessionId || null, eventType, payloadJson, ipAddress, userAgent]
    );

    res.status(201).json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/summary — funnel analytics summary (requires auth)
router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.tenant.id;

    // Sessions in last 30 days
    const sessionsResult = await query(
      `SELECT COUNT(DISTINCT session_id) as count
       FROM events 
       WHERE tenant_id = $1 AND event_type = 'session_start'
         AND ts >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    // Contact rate
    const contactsResult = await query(
      `SELECT COUNT(DISTINCT session_id) as count 
       FROM events
       WHERE tenant_id = $1 AND event_type = 'contact_saved'
         AND ts >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    // Share rate
    const sharesResult = await query(
      `SELECT COUNT(*) as count 
       FROM events
       WHERE tenant_id = $1 AND event_type = 'share_exported'
         AND ts >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    // Avg decision time using window functions
    const decisionResult = await query(
      `WITH session_times AS (
         SELECT 
           session_id,
           MIN(CASE WHEN event_type = 'session_start' THEN ts END) as start_time,
           MIN(CASE WHEN event_type = 'shade_selected' THEN ts END) as first_shade_time
         FROM events
         WHERE tenant_id = $1 
           AND ts >= NOW() - INTERVAL '30 days'
           AND session_id IS NOT NULL
         GROUP BY session_id
         HAVING COUNT(CASE WHEN event_type = 'session_start' THEN 1 END) > 0
            AND COUNT(CASE WHEN event_type = 'shade_selected' THEN 1 END) > 0
       )
       SELECT AVG(EXTRACT(EPOCH FROM (first_shade_time - start_time)) * 1000) as avg_ms
       FROM session_times`,
      [tenantId]
    );

    // 7-day daily sessions
    const dailyResult = await query(
      `SELECT DATE(ts) as day, COUNT(DISTINCT session_id) as sessions
       FROM events 
       WHERE tenant_id = $1 AND event_type = 'session_start'
         AND ts >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(ts) 
       ORDER BY day`,
      [tenantId]
    );

    // Total leads count
    const leadsResult = await query(
      "SELECT COUNT(*) as count FROM leads WHERE tenant_id = $1",
      [tenantId]
    );

    const sessionCount = parseInt(sessionsResult.rows[0]?.count || 0);
    const contactCount = parseInt(contactsResult.rows[0]?.count || 0);
    const shareCount = parseInt(sharesResult.rows[0]?.count || 0);

    res.json({
      period: "30d",
      sessions: sessionCount,
      contacts: contactCount,
      shares: shareCount,
      leads: parseInt(leadsResult.rows[0]?.count || 0),
      contactRate: sessionCount > 0 ? Math.round((contactCount / sessionCount) * 100) : 0,
      shareRate: sessionCount > 0 ? Math.round((shareCount / sessionCount) * 100) : 0,
      avgDecisionMs: decisionResult.rows[0]?.avg_ms 
        ? Math.round(parseFloat(decisionResult.rows[0].avg_ms)) 
        : null,
      daily: dailyResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events — raw events list (auth required, last 500)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, session_id, event_type, payload_json, ts
       FROM events 
       WHERE tenant_id = $1
       ORDER BY ts DESC 
       LIMIT 500`,
      [req.tenant.id]
    );

    res.json({
      events: result.rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        eventType: r.event_type,
        payload: r.payload_json,
        ts: r.ts,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
