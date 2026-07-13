const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { resolveCustomerId, assertSiteForCustomer, recordPreviewSession } = require('../lib/crm');

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = new Set(['session_start', 'shade_selected', 'lead_captured']);

// POST /api/sessions — record a preview session event on the timeline
router.post('/', async (req, res, next) => {
  try {
    const {
      customerId,
      siteId,
      leadId,
      pilotSessionId,
      sessionType,
      summary,
      shades,
      snapshotB64,
      name,
      phone,
      email,
    } = req.body || {};

    if (!sessionType || !VALID_TYPES.has(sessionType)) {
      return res.status(400).json({
        error: `sessionType required. Valid: ${[...VALID_TYPES].join(', ')}`,
      });
    }

    let resolvedCustomerId = customerId || null;
    if (!resolvedCustomerId && phone && name) {
      resolvedCustomerId = await resolveCustomerId(req.tenant.id, {
        customerId: null,
        name,
        phone,
        email,
      });
    }

    const resolvedSiteId = resolvedCustomerId
      ? await assertSiteForCustomer(req.tenant.id, siteId, resolvedCustomerId)
      : null;

    const row = await recordPreviewSession(req.tenant.id, {
      customerId: resolvedCustomerId,
      siteId: resolvedSiteId,
      leadId: leadId || null,
      pilotSessionId,
      sessionType,
      summary: summary || defaultSummary(sessionType, shades),
      shades,
      snapshotB64,
    });

    res.status(201).json({ session: formatSession(row) });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions — list recent sessions (?customerId=)
router.get('/', async (req, res, next) => {
  try {
    const { customerId } = req.query;
    let result;

    if (customerId) {
      result = await query(
        `SELECT * FROM preview_sessions
         WHERE tenant_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.tenant.id, customerId]
      );
    } else {
      result = await query(
        `SELECT * FROM preview_sessions
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.tenant.id]
      );
    }

    res.json({ sessions: result.rows.map(formatSession) });
  } catch (err) {
    next(err);
  }
});

function defaultSummary(sessionType, shades) {
  if (sessionType === 'session_start') return 'Preview session started';
  if (sessionType === 'shade_selected' && shades?.length) {
    const s = shades[0];
    return `Selected ${s.name || s.hex || 'shade'}`;
  }
  return '';
}

function formatSession(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    siteId: row.site_id,
    leadId: row.lead_id,
    pilotSessionId: row.pilot_session_id,
    sessionType: row.session_type,
    summary: row.summary,
    shades: row.shades_json || [],
    createdAt: row.created_at,
  };
}

module.exports = router;
