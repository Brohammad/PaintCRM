const express = require('express');
const { query, withTransaction } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const {
  ORDER_STATUSES,
  createOrder,
  getOrderWithItems,
  formatOrder,
} = require('../lib/quotes');
const { reverseOrderPosting } = require('../lib/ledger');
const { parsePagination, paginationMeta } = require('../lib/pagination');

const router = express.Router();
router.use(requireAuth);

async function assertCustomer(tenantId, customerId) {
  if (!customerId) return false;
  const res = await query(
    'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
    [customerId, tenantId]
  );
  return res.rows.length > 0;
}

async function resolveSite(tenantId, siteId, customerId) {
  if (!siteId) return null;
  const res = await query(
    'SELECT id FROM sites WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
    [siteId, tenantId, customerId]
  );
  return res.rows.length > 0 ? siteId : null;
}

// GET /api/orders — list (?customerId= &status= &limit= &offset=)
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status } = req.query;
    const { limit, offset } = parsePagination(req.query);
    const params = [req.tenant.id];
    let where = 'o.tenant_id = $1';
    if (customerId) {
      params.push(customerId);
      where += ` AND o.customer_id = $${params.length}`;
    }
    if (status && ORDER_STATUSES.includes(status)) {
      params.push(status);
      where += ` AND o.status = $${params.length}`;
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT o.*, c.name AS customer_name, s.name AS site_name, q.quote_number,
              (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              COUNT(*) OVER()::int AS total_count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN sites s ON s.id = o.site_id
       LEFT JOIN quotes q ON q.id = o.quote_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      orders: result.rows.map((row) => formatOrder(row)),
      pagination: paginationMeta(result.rows, limit, offset),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders — create an order directly (not from a quote)
router.post('/', async (req, res, next) => {
  try {
    const { customerId, siteId, status, notes, taxRate, discount, items, dueDate } = req.body || {};

    if (!(await assertCustomer(req.tenant.id, customerId))) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const resolvedSiteId = await resolveSite(req.tenant.id, siteId, customerId);

    const order = await createOrder(req.tenant.id, {
      customerId,
      siteId: resolvedSiteId,
      status,
      notes,
      taxRate,
      discount,
      items,
      dueDate,
    });

    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — order with items
router.get('/:id', async (req, res, next) => {
  try {
    const order = await getOrderWithItems(req.tenant.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/status — update fulfillment status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!status || !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status required. Valid: ${ORDER_STATUSES.join(', ')}`,
      });
    }

    const result = await query(
      `UPDATE orders
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [status, req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await getOrderWithItems(req.tenant.id, req.params.id);
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/:id — also reverses the order's posting to the ledger
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await withTransaction(async (client) => {
      const found = await client.query(
        'SELECT id, customer_id, order_number FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, req.tenant.id]
      );
      if (found.rows.length === 0) return false;

      await reverseOrderPosting(client, req.tenant.id, found.rows[0]);
      await client.query('DELETE FROM orders WHERE id = $1 AND tenant_id = $2', [
        req.params.id,
        req.tenant.id,
      ]);
      return true;
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
