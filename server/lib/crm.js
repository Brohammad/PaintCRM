const { query } = require('./db');

async function resolveCustomerId(tenantId, { customerId, name, phone, email, notes }) {
  if (customerId) {
    const existing = await query(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );
    if (existing.rows.length > 0) return customerId;
  }

  const normalizedPhone = (phone || '').trim();
  if (!normalizedPhone) return null;

  const byPhone = await query(
    'SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2 LIMIT 1',
    [tenantId, normalizedPhone]
  );
  if (byPhone.rows.length > 0) {
    await query(
      `UPDATE customers
       SET name = $1, email = COALESCE(NULLIF($2, ''), email), updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [(name || '').trim(), email || '', byPhone.rows[0].id]
    );
    return byPhone.rows[0].id;
  }

  const inserted = await query(
    `INSERT INTO customers (tenant_id, name, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantId, (name || '').trim(), normalizedPhone, email || '', notes || '']
  );
  return inserted.rows[0].id;
}

async function assertSiteForCustomer(tenantId, siteId, customerId) {
  if (!siteId) return null;
  const result = await query(
    'SELECT id FROM sites WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
    [siteId, tenantId, customerId]
  );
  return result.rows.length > 0 ? siteId : null;
}

async function recordPreviewSession(tenantId, payload) {
  const {
    customerId,
    siteId,
    leadId,
    pilotSessionId,
    sessionType,
    summary,
    shades,
    snapshotB64,
  } = payload;

  const result = await query(
    `INSERT INTO preview_sessions
       (tenant_id, customer_id, site_id, lead_id, pilot_session_id, session_type, summary, shades_json, snapshot_b64)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId,
      customerId || null,
      siteId || null,
      leadId || null,
      pilotSessionId || '',
      sessionType,
      summary || '',
      JSON.stringify(shades || []),
      snapshotB64 || '',
    ]
  );
  return result.rows[0];
}

module.exports = {
  resolveCustomerId,
  assertSiteForCustomer,
  recordPreviewSession,
};
