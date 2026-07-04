const { query, withTransaction } = require('./db');

const STOCK_STATUSES = ['in_stock', 'low_stock', 'out_of_stock'];

function validationError(message) {
  const err = new Error(message);
  err.name = 'ValidationError';
  return err;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toMoney(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

// Derived stock status: out when nothing on hand, low when at or below the
// reorder threshold (and a threshold is set), otherwise in stock.
function deriveStatus(quantity, reorderLevel) {
  const qty = Number(quantity);
  const reorder = Number(reorderLevel);
  if (qty <= 0) return 'out_of_stock';
  if (reorder > 0 && qty <= reorder) return 'low_stock';
  return 'in_stock';
}

async function createItem(tenantId, input) {
  const name = (input.name || '').trim();
  if (!name) throw validationError('name is required');

  const result = await query(
    `INSERT INTO inventory_items
       (tenant_id, sku, name, brand, shade_id, unit, quantity, reorder_level, unit_price, cost_price, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tenantId,
      (input.sku || '').trim().slice(0, 64),
      name.slice(0, 255),
      (input.brand || '').trim().slice(0, 120),
      (input.shadeId || '').toString().slice(0, 64),
      (input.unit || 'litre').trim().slice(0, 32),
      Math.max(0, toMoney(input.quantity, 0)),
      Math.max(0, toMoney(input.reorderLevel, 0)),
      Math.max(0, toMoney(input.unitPrice, 0)),
      Math.max(0, toMoney(input.costPrice, 0)),
      (input.notes || '').trim(),
    ]
  );

  const item = result.rows[0];
  // Record the opening balance as a movement for a complete audit trail.
  if (Number(item.quantity) !== 0) {
    await query(
      `INSERT INTO inventory_movements (tenant_id, item_id, delta, reason, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, item.id, item.quantity, 'Opening stock', item.quantity]
    );
  }
  return formatItem(item);
}

// Updates metadata + reorder level + prices. Quantity is NOT changed here —
// stock levels only move through adjustQuantity so every change is auditable.
async function updateItem(tenantId, itemId, input) {
  const name = (input.name || '').trim();
  if (!name) throw validationError('name is required');

  const result = await query(
    `UPDATE inventory_items
     SET sku = $1, name = $2, brand = $3, shade_id = $4, unit = $5,
         reorder_level = $6, unit_price = $7, cost_price = $8, notes = $9,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 AND tenant_id = $11
     RETURNING *`,
    [
      (input.sku || '').trim().slice(0, 64),
      name.slice(0, 255),
      (input.brand || '').trim().slice(0, 120),
      (input.shadeId || '').toString().slice(0, 64),
      (input.unit || 'litre').trim().slice(0, 32),
      Math.max(0, toMoney(input.reorderLevel, 0)),
      Math.max(0, toMoney(input.unitPrice, 0)),
      Math.max(0, toMoney(input.costPrice, 0)),
      (input.notes || '').trim(),
      itemId,
      tenantId,
    ]
  );
  if (result.rows.length === 0) return null;
  return formatItem(result.rows[0]);
}

// Applies a signed delta to on-hand quantity and records a movement. Returns
// sentinels for the route layer: { notFound } / { insufficient }.
async function adjustQuantity(tenantId, itemId, delta, reason) {
  const change = toMoney(delta, NaN);
  if (!Number.isFinite(change) || change === 0) {
    throw validationError('delta must be a non-zero number');
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [itemId, tenantId]
    );
    if (existing.rows.length === 0) return { notFound: true };

    const current = Number(existing.rows[0].quantity);
    const next = round2(current + change);
    if (next < 0) return { insufficient: true, available: current };

    const updated = await client.query(
      `UPDATE inventory_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [next, itemId, tenantId]
    );
    await client.query(
      `INSERT INTO inventory_movements (tenant_id, item_id, delta, reason, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, itemId, round2(change), (reason || '').toString().slice(0, 255), next]
    );

    return { item: formatItem(updated.rows[0]) };
  });
}

async function getItemWithMovements(tenantId, itemId) {
  const res = await query(
    'SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2',
    [itemId, tenantId]
  );
  if (res.rows.length === 0) return null;
  const movements = await query(
    `SELECT * FROM inventory_movements
     WHERE item_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [itemId]
  );
  const item = formatItem(res.rows[0]);
  item.movements = movements.rows.map(formatMovement);
  return item;
}

function formatItem(row) {
  return {
    id: row.id,
    sku: row.sku || '',
    name: row.name,
    brand: row.brand || '',
    shadeId: row.shade_id || '',
    unit: row.unit || 'litre',
    quantity: Number(row.quantity),
    reorderLevel: Number(row.reorder_level),
    unitPrice: Number(row.unit_price),
    costPrice: Number(row.cost_price),
    notes: row.notes || '',
    status: deriveStatus(row.quantity, row.reorder_level),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMovement(row) {
  return {
    id: row.id,
    delta: Number(row.delta),
    reason: row.reason || '',
    balanceAfter: Number(row.balance_after),
    createdAt: row.created_at,
  };
}

module.exports = {
  STOCK_STATUSES,
  deriveStatus,
  createItem,
  updateItem,
  adjustQuantity,
  getItemWithMovements,
  formatItem,
  formatMovement,
};
