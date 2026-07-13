const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUS = new Set(['active', 'completed', 'on_hold']);

// GET /api/sites — list sites (?customerId=)
router.get('/', async (req, res, next) => {
  try {
    const { customerId } = req.query;
    let result;

    if (customerId) {
      result = await query(
        `SELECT s.*, c.name AS customer_name
         FROM sites s
         JOIN customers c ON c.id = s.customer_id
         WHERE s.tenant_id = $1 AND s.customer_id = $2
         ORDER BY s.updated_at DESC`,
        [req.tenant.id, customerId]
      );
    } else {
      result = await query(
        `SELECT s.*, c.name AS customer_name
         FROM sites s
         JOIN customers c ON c.id = s.customer_id
         WHERE s.tenant_id = $1
         ORDER BY s.updated_at DESC`,
        [req.tenant.id]
      );
    }

    res.json({ sites: result.rows.map(formatSite) });
  } catch (err) {
    next(err);
  }
});

// POST /api/sites — create site
router.post('/', async (req, res, next) => {
  try {
    const { customerId, name, address, status, notes } = req.body || {};
    if (!customerId || !name) {
      return res.status(400).json({ error: 'customerId and name are required' });
    }
    if (status && !VALID_STATUS.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const customer = await query(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
      [customerId, req.tenant.id]
    );
    if (customer.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await query(
      `INSERT INTO sites (tenant_id, customer_id, name, address, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.tenant.id,
        customerId,
        name.trim(),
        (address || '').trim(),
        status || 'active',
        (notes || '').trim(),
      ]
    );

    res.status(201).json({ site: formatSite(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// GET /api/sites/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, c.name AS customer_name
       FROM sites s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [req.params.id, req.tenant.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json({ site: formatSite(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/sites/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, address, status, notes } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (status && !VALID_STATUS.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE sites
       SET name = $1, address = $2, status = COALESCE($3, status), notes = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [
        name.trim(),
        (address || '').trim(),
        status || null,
        (notes || '').trim(),
        req.params.id,
        req.tenant.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json({ site: formatSite(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sites/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM sites WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function formatSite(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || undefined,
    name: row.name,
    address: row.address,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
