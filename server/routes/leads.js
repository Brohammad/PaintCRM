const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/leads — list all leads for tenant (newest first)
router.get("/", (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, phone, email, notes, shades_json, cost_estimate_json, created_at
    FROM leads WHERE tenant_id = ? ORDER BY created_at DESC
  `).all(req.tenant.id);

  res.json({ leads: rows.map(formatLead) });
});

// POST /api/leads — create or upsert a lead
router.post("/", (req, res) => {
  const { id, name, phone, email, notes, shades, snapshotB64, costEstimate, createdAt } = req.body || {};

  if (!name || !phone)
    return res.status(400).json({ error: "name and phone are required" });

  const leadId = id || uuidv4();
  const tenantId = req.tenant.id;
  const shadesJson = shades ? JSON.stringify(shades) : null;
  const costJson = costEstimate ? JSON.stringify(costEstimate) : null;
  const ts = createdAt || new Date().toISOString();

  const existing = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(leadId, tenantId);

  if (existing) {
    db.prepare(`
      UPDATE leads SET name=?, phone=?, email=?, notes=?, shades_json=?,
        snapshot_b64=?, cost_estimate_json=?, synced_at=datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(name, phone, email || "", notes || "", shadesJson, snapshotB64 || "", costJson, leadId, tenantId);
  } else {
    db.prepare(`
      INSERT INTO leads (id, tenant_id, name, phone, email, notes, shades_json, snapshot_b64, cost_estimate_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(leadId, tenantId, name, phone, email || "", notes || "", shadesJson, snapshotB64 || "", costJson, ts);
  }

  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);
  res.status(existing ? 200 : 201).json({ lead: formatLead(row) });
});

// DELETE /api/leads/:id
router.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM leads WHERE id = ? AND tenant_id = ?").run(req.params.id, req.tenant.id);
  if (result.changes === 0) return res.status(404).json({ error: "Lead not found" });
  res.json({ ok: true });
});

// GET /api/leads/:id — single lead with snapshot
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM leads WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
  if (!row) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead: formatLead(row, true) });
});

function formatLead(row, includeSnapshot = false) {
  const obj = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    shades: row.shades_json ? JSON.parse(row.shades_json) : [],
    costEstimate: row.cost_estimate_json ? JSON.parse(row.cost_estimate_json) : null,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
  if (includeSnapshot) obj.snapshotB64 = row.snapshot_b64 || "";
  return obj;
}

module.exports = router;
