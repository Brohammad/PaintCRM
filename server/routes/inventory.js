const express = require('express');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, paginationMeta } = require('../lib/pagination');
const {
  STOCK_STATUSES,
  createItem,
  updateItem,
  adjustQuantity,
  getItemWithMovements,
  formatItem,
} = require('../lib/inventory');

const router = express.Router();
router.use(requireAuth);

// Maps a derived stock status to a SQL predicate over quantity/reorder_level.
function statusClause(status) {
  if (status === 'out_of_stock') return 'quantity <= 0';
  if (status === 'low_stock') return 'quantity > 0 AND reorder_level > 0 AND quantity <= reorder_level';
  if (status === 'in_stock') return 'quantity > 0 AND (reorder_level <= 0 OR quantity > reorder_level)';
  return null;
}

function isDuplicateSku(err) {
  return err && err.code === '23505';
}

// GET /api/inventory — list (?q= search, ?status= filter, ?limit= &offset=)
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const status = req.query.status;
    const { limit, offset } = parsePagination(req.query);
    const params = [req.tenant.id];
    let where = 'tenant_id = $1';

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (name ILIKE $${params.length} OR brand ILIKE $${params.length} OR sku ILIKE $${params.length})`;
    }
    if (status && STOCK_STATUSES.includes(status)) {
      where += ` AND (${statusClause(status)})`;
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT *, COUNT(*) OVER()::int AS total_count FROM inventory_items
       WHERE ${where}
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      items: result.rows.map(formatItem),
      pagination: paginationMeta(result.rows, limit, offset),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/summary — counts by stock status
router.get('/summary', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE quantity <= 0)::int AS out_of_stock,
         COUNT(*) FILTER (WHERE quantity > 0 AND reorder_level > 0 AND quantity <= reorder_level)::int AS low_stock,
         COUNT(*) FILTER (WHERE quantity > 0 AND (reorder_level <= 0 OR quantity > reorder_level))::int AS in_stock,
         COALESCE(SUM(quantity * cost_price), 0)::float AS stock_value
       FROM inventory_items
       WHERE tenant_id = $1`,
      [req.tenant.id]
    );
    const row = result.rows[0];
    res.json({
      summary: {
        total: row.total,
        inStock: row.in_stock,
        lowStock: row.low_stock,
        outOfStock: row.out_of_stock,
        stockValue: row.stock_value,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory — create an item
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const item = await createItem(req.tenant.id, req.body || {});
    res.status(201).json({ item });
  } catch (err) {
    if (isDuplicateSku(err)) return res.status(409).json({ error: 'An item with this SKU already exists' });
    next(err);
  }
});

// GET /api/inventory/:id — item with recent movements
router.get('/:id', async (req, res, next) => {
  try {
    const item = await getItemWithMovements(req.tenant.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/:id — update metadata (quantity is managed via /adjust)
router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const item = await updateItem(req.tenant.id, req.params.id, req.body || {});
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ item });
  } catch (err) {
    if (isDuplicateSku(err)) return res.status(409).json({ error: 'An item with this SKU already exists' });
    next(err);
  }
});

// POST /api/inventory/:id/adjust — apply a signed stock movement
router.post('/:id/adjust', async (req, res, next) => {
  try {
    const { delta, reason } = req.body || {};
    const result = await adjustQuantity(req.tenant.id, req.params.id, delta, reason);
    if (result.notFound) return res.status(404).json({ error: 'Item not found' });
    if (result.insufficient) {
      return res.status(400).json({ error: `Not enough stock. Available: ${result.available}` });
    }
    res.json({ item: result.item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM inventory_items WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenant.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
