const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const {
  QUOTE_STATUSES,
  createQuote,
  updateQuote,
  convertQuoteToOrder,
  getQuoteWithItems,
  formatQuote,
} = require('../lib/quotes');

const router = express.Router();
router.use(requireAuth);

// Statuses a client may set directly (conversion is a separate action).
const CLIENT_QUOTE_STATUSES = new Set(['draft', 'sent', 'accepted', 'rejected']);

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

// GET /api/quotes — list (?customerId= &status=)
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status } = req.query;
    const params = [req.tenant.id];
    let where = 'q.tenant_id = $1';
    if (customerId) {
      params.push(customerId);
      where += ` AND q.customer_id = $${params.length}`;
    }
    if (status && QUOTE_STATUSES.includes(status)) {
      params.push(status);
      where += ` AND q.status = $${params.length}`;
    }

    const result = await query(
      `SELECT q.*, c.name AS customer_name, s.name AS site_name,
              (SELECT COUNT(*)::int FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count
       FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN sites s ON s.id = q.site_id
       WHERE ${where}
       ORDER BY q.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ quotes: result.rows.map((row) => formatQuote(row)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes — create a quote with line items
router.post('/', async (req, res, next) => {
  try {
    const { customerId, siteId, status, notes, validUntil, taxRate, discount, items } = req.body || {};

    if (!(await assertCustomer(req.tenant.id, customerId))) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (status && !CLIENT_QUOTE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const resolvedSiteId = await resolveSite(req.tenant.id, siteId, customerId);

    const quote = await createQuote(req.tenant.id, {
      customerId,
      siteId: resolvedSiteId,
      status,
      notes,
      validUntil,
      taxRate,
      discount,
      items,
    });

    res.status(201).json({ quote });
  } catch (err) {
    next(err);
  }
});

// GET /api/quotes/:id — quote with items
router.get('/:id', async (req, res, next) => {
  try {
    const quote = await getQuoteWithItems(req.tenant.id, req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json({ quote });
  } catch (err) {
    next(err);
  }
});

// PUT /api/quotes/:id — replace header + line items
router.put('/:id', async (req, res, next) => {
  try {
    const { siteId, status, notes, validUntil, taxRate, discount, items } = req.body || {};

    if (status && !CLIENT_QUOTE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await getQuoteWithItems(req.tenant.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Quote not found' });

    const resolvedSiteId = await resolveSite(req.tenant.id, siteId, existing.customerId);

    const quote = await updateQuote(req.tenant.id, req.params.id, {
      siteId: resolvedSiteId,
      status,
      notes,
      validUntil,
      taxRate,
      discount,
      items,
    });
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    res.json({ quote });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/quotes/:id/status — update workflow status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!status || !CLIENT_QUOTE_STATUSES.has(status)) {
      return res.status(400).json({
        error: `status required. Valid: ${[...CLIENT_QUOTE_STATUSES].join(', ')}`,
      });
    }

    const result = await query(
      `UPDATE quotes
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 AND status <> 'converted'
       RETURNING id`,
      [status, req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Quote not found or already converted' });
    }

    const quote = await getQuoteWithItems(req.tenant.id, req.params.id);
    res.json({ quote });
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes/:id/convert — create an order from this quote
router.post('/:id/convert', async (req, res, next) => {
  try {
    const result = await convertQuoteToOrder(req.tenant.id, req.params.id);
    if (result.notFound) return res.status(404).json({ error: 'Quote not found' });
    if (result.alreadyConverted) {
      return res.status(409).json({ error: 'Quote is already converted' });
    }
    res.status(201).json({ order: result.order });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/quotes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM quotes WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
