const { query, withTransaction } = require('./db');

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'converted'];
const ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'];

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
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// Coerce/validate incoming line items. Each item needs a description; quantity
// and unit_price default sensibly. line_total is always derived (never trusted
// from the client).
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw validationError('At least one line item is required');
  }

  return rawItems.map((item, index) => {
    const description = (item.description || '').toString().trim();
    if (!description) {
      throw validationError(`Line item ${index + 1} is missing a description`);
    }
    const quantity = toMoney(item.quantity, 1);
    const unitPrice = toMoney(item.unitPrice, 0);
    return {
      shadeId: (item.shadeId || '').toString().slice(0, 64),
      description: description.slice(0, 255),
      brand: (item.brand || '').toString().slice(0, 120),
      unit: (item.unit || 'litre').toString().slice(0, 32),
      quantity,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
      sortOrder: Number.isInteger(item.sortOrder) ? item.sortOrder : index,
    };
  });
}

// subtotal = sum(line totals); discount is applied to the subtotal, tax is a
// percentage of the discounted base, total = discounted base + tax.
function computeTotals(items, { taxRate = 0, discount = 0 } = {}) {
  const rate = toMoney(taxRate, 0);
  const disc = toMoney(discount, 0);
  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  const discountedBase = Math.max(0, round2(subtotal - disc));
  const taxAmount = round2((discountedBase * rate) / 100);
  const total = round2(discountedBase + taxAmount);
  return { subtotal, taxRate: rate, discount: disc, taxAmount, total };
}

// Per-tenant sequential document number, resilient to deletions (uses the max
// numeric suffix seen so far rather than a raw count).
async function nextDocNumber(client, tenantId, table, column, prefix) {
  const res = await client.query(
    `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(${column}, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) + 1 AS next
     FROM ${table} WHERE tenant_id = $1`,
    [tenantId]
  );
  const next = res.rows[0].next || 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function insertItems(client, tenantId, table, fkColumn, fkValue, items) {
  for (const it of items) {
    await client.query(
      `INSERT INTO ${table}
         (tenant_id, ${fkColumn}, shade_id, description, brand, unit, quantity, unit_price, line_total, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        fkValue,
        it.shadeId,
        it.description,
        it.brand,
        it.unit,
        it.quantity,
        it.unitPrice,
        it.lineTotal,
        it.sortOrder,
      ]
    );
  }
}

async function fetchItems(runner, table, fkColumn, fkValue) {
  const res = await runner.query(
    `SELECT * FROM ${table} WHERE ${fkColumn} = $1 ORDER BY sort_order ASC, description ASC`,
    [fkValue]
  );
  return res.rows.map(formatItem);
}

async function createQuote(tenantId, input) {
  const items = normalizeItems(input.items);
  const totals = computeTotals(items, { taxRate: input.taxRate, discount: input.discount });
  const status = QUOTE_STATUSES.includes(input.status) ? input.status : 'draft';

  const quoteId = await withTransaction(async (client) => {
    const number = await nextDocNumber(client, tenantId, 'quotes', 'quote_number', 'Q-');
    const inserted = await client.query(
      `INSERT INTO quotes
         (tenant_id, customer_id, site_id, quote_number, status, notes,
          discount, tax_rate, subtotal, tax_amount, total, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        tenantId,
        input.customerId,
        input.siteId || null,
        number,
        status,
        (input.notes || '').trim(),
        totals.discount,
        totals.taxRate,
        totals.subtotal,
        totals.taxAmount,
        totals.total,
        input.validUntil || null,
      ]
    );
    const id = inserted.rows[0].id;
    await insertItems(client, tenantId, 'quote_items', 'quote_id', id, items);
    return id;
  });

  return getQuoteWithItems(tenantId, quoteId);
}

// Full replace of a quote's header + line items. Returns null if not found.
// Converted quotes are locked from editing.
async function updateQuote(tenantId, quoteId, input) {
  const items = normalizeItems(input.items);
  const totals = computeTotals(items, { taxRate: input.taxRate, discount: input.discount });

  const found = await withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT * FROM quotes WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [quoteId, tenantId]
    );
    if (existing.rows.length === 0) return false;
    if (existing.rows[0].status === 'converted') {
      throw validationError('A converted quote cannot be edited');
    }

    const status = QUOTE_STATUSES.includes(input.status)
      ? input.status
      : existing.rows[0].status;

    await client.query(
      `UPDATE quotes
       SET site_id = $1, status = $2, notes = $3, discount = $4, tax_rate = $5,
           subtotal = $6, tax_amount = $7, total = $8, valid_until = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND tenant_id = $11`,
      [
        input.siteId || null,
        status,
        (input.notes || '').trim(),
        totals.discount,
        totals.taxRate,
        totals.subtotal,
        totals.taxAmount,
        totals.total,
        input.validUntil || null,
        quoteId,
        tenantId,
      ]
    );

    await client.query('DELETE FROM quote_items WHERE quote_id = $1', [quoteId]);
    await insertItems(client, tenantId, 'quote_items', 'quote_id', quoteId, items);
    return true;
  });

  if (!found) return null;
  return getQuoteWithItems(tenantId, quoteId);
}

// Creates an order from an existing quote and marks the quote converted.
// Returns { notFound } / { alreadyConverted } sentinels for the route layer.
async function convertQuoteToOrder(tenantId, quoteId) {
  const result = await withTransaction(async (client) => {
    const quoteRes = await client.query(
      'SELECT * FROM quotes WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [quoteId, tenantId]
    );
    if (quoteRes.rows.length === 0) return { notFound: true };
    const quote = quoteRes.rows[0];
    if (quote.status === 'converted') return { alreadyConverted: true };

    const items = await fetchItems(client, 'quote_items', 'quote_id', quoteId);
    if (items.length === 0) {
      throw validationError('Cannot convert a quote with no line items');
    }

    const number = await nextDocNumber(client, tenantId, 'orders', 'order_number', 'O-');
    const orderRes = await client.query(
      `INSERT INTO orders
         (tenant_id, customer_id, site_id, quote_id, order_number, status, notes,
          discount, tax_rate, subtotal, tax_amount, total)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        quote.customer_id,
        quote.site_id,
        quote.id,
        number,
        quote.notes,
        quote.discount,
        quote.tax_rate,
        quote.subtotal,
        quote.tax_amount,
        quote.total,
      ]
    );
    const orderId = orderRes.rows[0].id;
    await insertItems(client, tenantId, 'order_items', 'order_id', orderId, items);

    await client.query(
      `UPDATE quotes SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [quoteId]
    );

    return { orderId };
  });

  if (result.orderId) {
    return { order: await getOrderWithItems(tenantId, result.orderId) };
  }
  return result;
}

async function createOrder(tenantId, input) {
  const items = normalizeItems(input.items);
  const totals = computeTotals(items, { taxRate: input.taxRate, discount: input.discount });
  const status = ORDER_STATUSES.includes(input.status) ? input.status : 'pending';

  const orderId = await withTransaction(async (client) => {
    const number = await nextDocNumber(client, tenantId, 'orders', 'order_number', 'O-');
    const inserted = await client.query(
      `INSERT INTO orders
         (tenant_id, customer_id, site_id, quote_id, order_number, status, notes,
          discount, tax_rate, subtotal, tax_amount, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        tenantId,
        input.customerId,
        input.siteId || null,
        input.quoteId || null,
        number,
        status,
        (input.notes || '').trim(),
        totals.discount,
        totals.taxRate,
        totals.subtotal,
        totals.taxAmount,
        totals.total,
      ]
    );
    const id = inserted.rows[0].id;
    await insertItems(client, tenantId, 'order_items', 'order_id', id, items);
    return id;
  });

  return getOrderWithItems(tenantId, orderId);
}

async function getQuoteWithItems(tenantId, quoteId) {
  const res = await query(
    `SELECT q.*, c.name AS customer_name, s.name AS site_name
     FROM quotes q
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN sites s ON s.id = q.site_id
     WHERE q.id = $1 AND q.tenant_id = $2`,
    [quoteId, tenantId]
  );
  if (res.rows.length === 0) return null;
  const items = await fetchItems({ query }, 'quote_items', 'quote_id', quoteId);
  return formatQuote(res.rows[0], items);
}

async function getOrderWithItems(tenantId, orderId) {
  const res = await query(
    `SELECT o.*, c.name AS customer_name, s.name AS site_name, q.quote_number
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN sites s ON s.id = o.site_id
     LEFT JOIN quotes q ON q.id = o.quote_id
     WHERE o.id = $1 AND o.tenant_id = $2`,
    [orderId, tenantId]
  );
  if (res.rows.length === 0) return null;
  const items = await fetchItems({ query }, 'order_items', 'order_id', orderId);
  return formatOrder(res.rows[0], items);
}

function formatItem(row) {
  return {
    id: row.id,
    shadeId: row.shade_id || '',
    description: row.description,
    brand: row.brand || '',
    unit: row.unit || 'litre',
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    sortOrder: row.sort_order,
  };
}

function formatQuote(row, items) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || undefined,
    siteId: row.site_id || null,
    siteName: row.site_name || undefined,
    quoteNumber: row.quote_number,
    status: row.status,
    currency: row.currency,
    notes: row.notes || '',
    discount: Number(row.discount),
    taxRate: Number(row.tax_rate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    validUntil: row.valid_until || null,
    itemCount: row.item_count !== undefined ? Number(row.item_count) : undefined,
    items: items || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatOrder(row, items) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || undefined,
    siteId: row.site_id || null,
    siteName: row.site_name || undefined,
    quoteId: row.quote_id || null,
    quoteNumber: row.quote_number || undefined,
    orderNumber: row.order_number,
    status: row.status,
    currency: row.currency,
    notes: row.notes || '',
    discount: Number(row.discount),
    taxRate: Number(row.tax_rate),
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    itemCount: row.item_count !== undefined ? Number(row.item_count) : undefined,
    items: items || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  QUOTE_STATUSES,
  ORDER_STATUSES,
  normalizeItems,
  computeTotals,
  createQuote,
  updateQuote,
  convertQuoteToOrder,
  createOrder,
  getQuoteWithItems,
  getOrderWithItems,
  formatQuote,
  formatOrder,
  formatItem,
};
