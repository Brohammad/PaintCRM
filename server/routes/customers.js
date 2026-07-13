const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, paginationMeta } = require('../lib/pagination');

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = new Set(['end_customer', 'contractor']);

// GET /api/customers — list customers (?q= search, ?limit= &offset=)
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const { limit, offset } = parsePagination(req.query);
    const params = [req.tenant.id];
    let where = 'c.tenant_id = $1';

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM leads l WHERE l.customer_id = c.id) AS lead_count,
              (SELECT COUNT(*)::int FROM sites s WHERE s.customer_id = c.id) AS site_count,
              COUNT(*) OVER()::int AS total_count
       FROM customers c
       WHERE ${where}
       ORDER BY c.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      customers: result.rows.map(formatCustomer),
      pagination: paginationMeta(result.rows, limit, offset),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers — create customer
router.post('/', async (req, res, next) => {
  try {
    const { name, phone, email, notes, customerType } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    if (customerType && !VALID_TYPES.has(customerType)) {
      return res.status(400).json({ error: 'Invalid customerType' });
    }

    const result = await query(
      `INSERT INTO customers (tenant_id, name, phone, email, notes, customer_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.tenant.id,
        name.trim(),
        phone.trim(),
        (email || '').trim(),
        (notes || '').trim(),
        customerType || 'end_customer',
      ]
    );

    res.status(201).json({ customer: formatCustomer(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id — single customer
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenant.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ customer: formatCustomer(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id — update customer
router.put('/:id', async (req, res, next) => {
  try {
    const { name, phone, email, notes, customerType } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'name and phone are required' });
    }
    if (customerType && !VALID_TYPES.has(customerType)) {
      return res.status(400).json({ error: 'Invalid customerType' });
    }

    const result = await query(
      `UPDATE customers
       SET name = $1, phone = $2, email = $3, notes = $4,
           customer_type = COALESCE($5, customer_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND tenant_id = $7
       RETURNING *`,
      [
        name.trim(),
        phone.trim(),
        (email || '').trim(),
        (notes || '').trim(),
        customerType || null,
        req.params.id,
        req.tenant.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer: formatCustomer(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM customers WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/timeline — leads + preview sessions
router.get('/:id/timeline', async (req, res, next) => {
  try {
    const customerId = req.params.id;
    const tenantId = req.tenant.id;

    const customer = await query(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );
    if (customer.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await query(
      `SELECT * FROM (
         SELECT
           'lead_captured'::text AS kind,
           l.id,
           l.created_at AS ts,
           l.name AS title,
           l.shades_json,
           l.snapshot_b64,
           NULL::varchar AS pilot_session_id,
           s.name AS site_name
         FROM leads l
         LEFT JOIN sites s ON s.id = l.site_id
         WHERE l.customer_id = $1 AND l.tenant_id = $2
         UNION ALL
         SELECT
           ps.session_type AS kind,
           ps.id,
           ps.created_at AS ts,
           ps.summary AS title,
           ps.shades_json,
           ps.snapshot_b64,
           ps.pilot_session_id,
           s.name AS site_name
         FROM preview_sessions ps
         LEFT JOIN sites s ON s.id = ps.site_id
         WHERE ps.customer_id = $1 AND ps.tenant_id = $2
           AND ps.lead_id IS NULL
       ) timeline
       ORDER BY ts DESC
       LIMIT 100`,
      [customerId, tenantId]
    );

    res.json({
      customerId,
      timeline: result.rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        ts: row.ts,
        title: row.title,
        shades: row.shades_json || [],
        hasSnapshot: !!(row.snapshot_b64),
        pilotSessionId: row.pilot_session_id || null,
        siteName: row.site_name || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function formatCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    customerType: row.customer_type,
    leadCount: row.lead_count !== undefined && row.lead_count !== null ? row.lead_count : undefined,
    siteCount: row.site_count !== undefined && row.site_count !== null ? row.site_count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
