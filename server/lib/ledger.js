const { query, withTransaction } = require('./db');
const { buildReminderMessage, deliverReminder } = require('./notify');

// A customer's balance is the amount they currently owe: debits (charges / order
// totals) increase it, credits (payments / adjustments) reduce it. A positive
// balance means the customer owes money; a negative balance is an advance/credit.
const ENTRY_TYPES = ['debit', 'credit'];
// Sources a client may set on a manual entry (system posts 'order' / 'reversal').
const MANUAL_SOURCES = ['manual', 'payment', 'adjustment'];
const LEDGER_SOURCES = [...MANUAL_SOURCES, 'order', 'reversal'];
const REMINDER_CHANNELS = ['manual', 'call', 'sms', 'whatsapp', 'email'];

function validationError(message) {
  const err = new Error(message);
  err.name = 'ValidationError';
  return err;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const BALANCE_SUM = `COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0)`;

// Core building block: applies a signed entry to a customer's account inside an
// existing transaction. Locks the customer row so the running balance is
// computed and written atomically under concurrent posts. Returns { entry } or
// { notFound } for the route/caller to translate.
async function postEntry(client, tenantId, customerId, input) {
  const entryType = input.entryType;
  if (!ENTRY_TYPES.includes(entryType)) {
    throw validationError("entryType must be 'debit' or 'credit'");
  }
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw validationError('amount must be a positive number');
  }
  const source = LEDGER_SOURCES.includes(input.source) ? input.source : 'manual';

  const cust = await client.query(
    'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
    [customerId, tenantId]
  );
  if (cust.rows.length === 0) return { notFound: true };

  const balRes = await client.query(
    `SELECT ${BALANCE_SUM} AS bal FROM ledger_entries WHERE tenant_id = $1 AND customer_id = $2`,
    [tenantId, customerId]
  );
  const before = round2(Number(balRes.rows[0].bal));
  const delta = entryType === 'debit' ? amount : -amount;
  const balanceAfter = round2(before + delta);

  const inserted = await client.query(
    `INSERT INTO ledger_entries
       (tenant_id, customer_id, entry_type, amount, source, reference_id,
        reference_label, note, due_date, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId,
      customerId,
      entryType,
      amount,
      source,
      input.referenceId || null,
      (input.referenceLabel || '').toString().slice(0, 64),
      (input.note || '').toString(),
      input.dueDate || null,
      balanceAfter,
    ]
  );
  return { entry: formatEntry(inserted.rows[0]) };
}

// Public wrapper for a manual/standalone entry (opens its own transaction).
async function addEntry(tenantId, customerId, input) {
  const source = MANUAL_SOURCES.includes(input.source) ? input.source : 'manual';
  return withTransaction((client) =>
    postEntry(client, tenantId, customerId, { ...input, source })
  );
}

// Posts an order's total as a debit against the customer. Called from within the
// order-creation transaction. No-op for non-positive totals.
async function postOrderDebit(client, tenantId, order) {
  const total = round2(order.total);
  if (!Number.isFinite(total) || total <= 0) return null;
  return postEntry(client, tenantId, order.customer_id, {
    entryType: 'debit',
    amount: total,
    source: 'order',
    referenceId: order.id,
    referenceLabel: order.order_number,
    note: `Order ${order.order_number}`,
    dueDate: order.due_date || null,
  });
}

// Reverses whatever an order posted to the ledger (used when the order is
// deleted) by writing a compensating credit for the net outstanding amount.
// Keeps the ledger append-only and balances correct. Returns null when nothing
// remains to reverse.
async function reverseOrderPosting(client, tenantId, order) {
  const res = await client.query(
    `SELECT ${BALANCE_SUM} AS net
     FROM ledger_entries
     WHERE tenant_id = $1 AND reference_id = $2 AND source IN ('order', 'reversal')`,
    [tenantId, order.id]
  );
  const net = round2(Number(res.rows[0].net));
  if (net <= 0) return null;
  return postEntry(client, tenantId, order.customer_id, {
    entryType: 'credit',
    amount: net,
    source: 'reversal',
    referenceId: order.id,
    referenceLabel: order.order_number,
    note: `Reversal of ${order.order_number} (order deleted)`,
  });
}

// Logs a payment reminder against a customer, snapshotting their outstanding
// balance at the time. Returns { reminder, balance } or { notFound }.
async function addReminder(tenantId, customerId, input) {
  return withTransaction(async (client) => {
    const cust = await client.query(
      'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [customerId, tenantId]
    );
    if (cust.rows.length === 0) return { notFound: true };

    const balRes = await client.query(
      `SELECT ${BALANCE_SUM} AS bal FROM ledger_entries WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, customerId]
    );
    const balance = round2(Number(balRes.rows[0].bal));
    const channel = REMINDER_CHANNELS.includes(input.channel) ? input.channel : 'manual';

    const inserted = await client.query(
      `INSERT INTO payment_reminders (tenant_id, customer_id, channel, note, balance_at_reminder)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, customerId, channel, (input.note || '').toString(), balance]
    );
    return { reminder: formatReminder(inserted.rows[0]), balance };
  });
}

// Builds the reminder text, attempts outbound delivery (WhatsApp/SMS), and logs
// the action. Returns { reminder, delivery, balance } or { notFound, noPhone }.
async function sendReminder(tenantId, customerId, { channel = 'whatsapp', note = '', shopName = '' } = {}) {
  const ledger = await getCustomerLedger(tenantId, customerId);
  if (!ledger) return { notFound: true };

  if (!['whatsapp', 'sms'].includes(channel)) {
    const err = validationError(`send supports whatsapp or sms; got '${channel}'`);
    throw err;
  }

  if (!ledger.phone) return { notFound: false, noPhone: true };

  const message = buildReminderMessage({
    shopName,
    customerName: ledger.customerName,
    balance: ledger.balance,
    dueDate: ledger.oldestOverdueDate || ledger.oldestDueDate,
  });

  const delivery = await deliverReminder({
    channel,
    phone: ledger.phone,
    message,
  });

  const deliveryNote = [
    note,
    delivery.sent ? `Sent via ${delivery.provider || channel}` : `Delivery: ${delivery.status}`,
    delivery.url ? 'WhatsApp chat link generated' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const logged = await addReminder(tenantId, customerId, {
    channel,
    note: deliveryNote || message.slice(0, 240),
  });
  if (logged.notFound) return { notFound: true };

  return {
    reminder: logged.reminder,
    balance: logged.balance,
    delivery,
    message,
  };
}

// Full statement for one customer: balance, overdue state, entries + reminders.
async function getCustomerLedger(tenantId, customerId) {
  const custRes = await query(
    'SELECT id, name, phone, email FROM customers WHERE id = $1 AND tenant_id = $2',
    [customerId, tenantId]
  );
  if (custRes.rows.length === 0) return null;
  const cust = custRes.rows[0];

  const aggRes = await query(
    `SELECT
       ${BALANCE_SUM} AS balance,
       MIN(CASE WHEN entry_type = 'debit' AND due_date IS NOT NULL AND due_date < CURRENT_DATE THEN due_date END) AS oldest_overdue_due,
       MIN(CASE WHEN entry_type = 'debit' AND due_date IS NOT NULL THEN due_date END) AS oldest_due
     FROM ledger_entries WHERE tenant_id = $1 AND customer_id = $2`,
    [tenantId, customerId]
  );
  const balance = round2(Number(aggRes.rows[0].balance));
  const oldestOverdueDate = aggRes.rows[0].oldest_overdue_due || null;

  const entriesRes = await query(
    `SELECT * FROM ledger_entries
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC, id DESC LIMIT 200`,
    [tenantId, customerId]
  );
  const remindersRes = await query(
    `SELECT * FROM payment_reminders
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC LIMIT 50`,
    [tenantId, customerId]
  );

  return {
    customerId: cust.id,
    customerName: cust.name,
    phone: cust.phone,
    email: cust.email || '',
    balance,
    overdue: balance > 0.005 && !!oldestOverdueDate,
    oldestOverdueDate,
    oldestDueDate: aggRes.rows[0].oldest_due || null,
    entries: entriesRes.rows.map(formatEntry),
    reminders: remindersRes.rows.map(formatReminder),
  };
}

// Worklist of customers with an outstanding balance (optionally overdue-only).
// Returns { rows, total } for the route to page over.
async function listBalances(tenantId, { overdueOnly = false, q = '', limit = 50, offset = 0 } = {}) {
  const params = [tenantId];
  let filter = '';
  if (q) {
    params.push(`%${q}%`);
    filter = ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
  }

  let outer = 'WHERE a.balance > 0.005';
  if (overdueOnly) outer += ' AND a.oldest_overdue_due IS NOT NULL';

  params.push(limit, offset);

  const res = await query(
    `WITH a AS (
       SELECT c.id, c.name, c.phone,
              ${BALANCE_SUM} AS balance,
              MIN(CASE WHEN le.entry_type = 'debit' AND le.due_date IS NOT NULL AND le.due_date < CURRENT_DATE THEN le.due_date END) AS oldest_overdue_due,
              MAX(le.created_at) AS last_entry_at
       FROM customers c
       JOIN ledger_entries le ON le.customer_id = c.id AND le.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1${filter}
       GROUP BY c.id, c.name, c.phone
     )
     SELECT a.*, r.last_reminder_at, COUNT(*) OVER()::int AS total_count
     FROM a
     LEFT JOIN LATERAL (
       SELECT MAX(created_at) AS last_reminder_at
       FROM payment_reminders pr
       WHERE pr.customer_id = a.id AND pr.tenant_id = $1
     ) r ON TRUE
     ${outer}
     ORDER BY (a.oldest_overdue_due IS NOT NULL) DESC, a.balance DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = res.rows.length > 0 ? Number(res.rows[0].total_count) : 0;
  return { rows: res.rows.map(formatBalanceRow), total };
}

// Tenant-wide receivables snapshot for the ledger dashboard.
async function ledgerSummary(tenantId) {
  const res = await query(
    `WITH a AS (
       SELECT c.id,
              ${BALANCE_SUM} AS balance,
              BOOL_OR(le.entry_type = 'debit' AND le.due_date IS NOT NULL AND le.due_date < CURRENT_DATE) AS has_overdue
       FROM customers c
       JOIN ledger_entries le ON le.customer_id = c.id AND le.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1
       GROUP BY c.id
     )
     SELECT
       COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::float AS receivable,
       COALESCE(SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0)::float AS advances,
       COUNT(*) FILTER (WHERE balance > 0.005)::int AS debtors,
       COUNT(*) FILTER (WHERE balance > 0.005 AND has_overdue)::int AS overdue_customers,
       COALESCE(SUM(CASE WHEN balance > 0.005 AND has_overdue THEN balance ELSE 0 END), 0)::float AS overdue_amount
     FROM a`,
    [tenantId]
  );
  const row = res.rows[0] || {};
  return {
    receivable: round2(row.receivable || 0),
    advances: round2(row.advances || 0),
    debtors: row.debtors || 0,
    overdueCustomers: row.overdue_customers || 0,
    overdueAmount: round2(row.overdue_amount || 0),
  };
}

function formatEntry(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    source: row.source,
    referenceId: row.reference_id || null,
    referenceLabel: row.reference_label || '',
    note: row.note || '',
    dueDate: row.due_date || null,
    balanceAfter: Number(row.balance_after),
    createdAt: row.created_at,
  };
}

function formatReminder(row) {
  return {
    id: row.id,
    channel: row.channel,
    note: row.note || '',
    balanceAtReminder: Number(row.balance_at_reminder),
    createdAt: row.created_at,
  };
}

function formatBalanceRow(row) {
  const balance = round2(Number(row.balance));
  return {
    customerId: row.id,
    customerName: row.name,
    phone: row.phone,
    balance,
    overdue: balance > 0.005 && !!row.oldest_overdue_due,
    oldestOverdueDate: row.oldest_overdue_due || null,
    lastEntryAt: row.last_entry_at || null,
    lastReminderAt: row.last_reminder_at || null,
  };
}

module.exports = {
  ENTRY_TYPES,
  MANUAL_SOURCES,
  LEDGER_SOURCES,
  REMINDER_CHANNELS,
  postEntry,
  addEntry,
  postOrderDebit,
  reverseOrderPosting,
  addReminder,
  sendReminder,
  getCustomerLedger,
  listBalances,
  ledgerSummary,
  formatEntry,
  formatReminder,
  formatBalanceRow,
};
