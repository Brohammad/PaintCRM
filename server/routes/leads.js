const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../lib/db");
const { requireAuth } = require("../middleware/auth");
const { parsePagination, paginationMeta } = require("../lib/pagination");
const {
  resolveCustomerId,
  assertSiteForCustomer,
  recordPreviewSession,
} = require("../lib/crm");

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// GET /api/leads — list leads for tenant (newest first, ?limit= &offset=)
router.get("/", async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const result = await query(
      `SELECT id, name, phone, email, notes, shades_json, cost_estimate_json,
              customer_id, site_id, created_at, synced_at,
              COUNT(*) OVER()::int AS total_count
       FROM leads WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.tenant.id, limit, offset]
    );

    res.json({
      leads: result.rows.map(formatLead),
      pagination: paginationMeta(result.rows, limit, offset),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads — create or upsert a lead
router.post("/", async (req, res, next) => {
  try {
    const {
      id, name, phone, email, notes, shades, snapshotB64, costEstimate, createdAt,
      customerId, siteId, pilotSessionId,
    } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: "name and phone are required" });
    }

    const leadId = isValidUuid(id) ? id : uuidv4();
    const tenantId = req.tenant.id;
    const shadesJson = JSON.stringify(shades || []);
    const costJson = JSON.stringify(costEstimate || {});
    const ts = createdAt ? new Date(createdAt) : new Date();

    const resolvedCustomerId = await resolveCustomerId(tenantId, {
      customerId,
      name,
      phone,
      email,
      notes,
    });
    const resolvedSiteId = resolvedCustomerId
      ? await assertSiteForCustomer(tenantId, siteId, resolvedCustomerId)
      : null;

    // Check if lead exists
    const existing = await query(
      'SELECT id FROM leads WHERE id = $1 AND tenant_id = $2',
      [leadId, tenantId]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE leads
         SET name = $1, phone = $2, email = $3, notes = $4, shades_json = $5,
             snapshot_b64 = $6, cost_estimate_json = $7,
             customer_id = $8, site_id = $9, synced_at = CURRENT_TIMESTAMP
         WHERE id = $10 AND tenant_id = $11`,
        [
          name, phone, email || "", notes || "", shadesJson, snapshotB64 || "", costJson,
          resolvedCustomerId, resolvedSiteId, leadId, tenantId,
        ]
      );
    } else {
      await query(
        `INSERT INTO leads
           (id, tenant_id, name, phone, email, notes, shades_json, snapshot_b64,
            cost_estimate_json, customer_id, site_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          leadId, tenantId, name, phone, email || "", notes || "", shadesJson,
          snapshotB64 || "", costJson, resolvedCustomerId, resolvedSiteId, ts,
        ]
      );
    }

    await recordPreviewSession(tenantId, {
      customerId: resolvedCustomerId,
      siteId: resolvedSiteId,
      leadId,
      pilotSessionId,
      sessionType: 'lead_captured',
      summary: `Lead captured — ${name}`,
      shades,
      snapshotB64,
    });

    const result = await query(
      'SELECT * FROM leads WHERE id = $1',
      [leadId]
    );

    res.status(existing.rows.length > 0 ? 200 : 201).json({ lead: formatLead(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leads/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM leads WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id — single lead with snapshot
router.get("/:id", async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenant.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ lead: formatLead(result.rows[0], true) });
  } catch (err) {
    next(err);
  }
});

function formatLead(row, includeSnapshot = false) {
  const obj = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    shades: row.shades_json || [],
    costEstimate: row.cost_estimate_json || null,
    customerId: row.customer_id || null,
    siteId: row.site_id || null,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
  if (includeSnapshot) obj.snapshotB64 = row.snapshot_b64 || "";
  return obj;
}

function isValidUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = router;
