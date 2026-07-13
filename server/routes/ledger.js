const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { parsePagination } = require('../lib/pagination');
const {
  ENTRY_TYPES,
  MANUAL_SOURCES,
  REMINDER_CHANNELS,
  addEntry,
  addReminder,
  getCustomerLedger,
  listBalances,
  ledgerSummary,
} = require('../lib/ledger');

const router = express.Router();
router.use(requireAuth);

// GET /api/ledger/summary — tenant-wide receivables snapshot
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await ledgerSummary(req.tenant.id);
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/ledger/customers — customers with an outstanding balance
// (?overdue=true, ?q= search by name/phone, ?limit= &offset=)
router.get('/customers', async (req, res, next) => {
  try {
    const overdueOnly = req.query.overdue === 'true' || req.query.overdue === '1';
    const q = (req.query.q || '').trim();
    const { limit, offset } = parsePagination(req.query);
    const { rows, total } = await listBalances(req.tenant.id, { overdueOnly, q, limit, offset });
    res.json({ customers: rows, pagination: { total, limit, offset, hasMore: offset + rows.length < total } });
  } catch (err) {
    next(err);
  }
});

// GET /api/ledger/customers/:id — full statement for one customer
router.get('/customers/:id', async (req, res, next) => {
  try {
    const ledger = await getCustomerLedger(req.tenant.id, req.params.id);
    if (!ledger) return res.status(404).json({ error: 'Customer not found' });
    res.json({ ledger });
  } catch (err) {
    next(err);
  }
});

// POST /api/ledger/customers/:id/entries — record a debit (charge) or credit (payment)
router.post('/customers/:id/entries', async (req, res, next) => {
  try {
    const { entryType, amount, note, dueDate, source } = req.body || {};
    if (!ENTRY_TYPES.includes(entryType)) {
      return res.status(400).json({ error: `entryType required. Valid: ${ENTRY_TYPES.join(', ')}` });
    }
    if (source && !MANUAL_SOURCES.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Valid: ${MANUAL_SOURCES.join(', ')}` });
    }

    const result = await addEntry(req.tenant.id, req.params.id, {
      entryType,
      amount,
      note,
      dueDate,
      source,
    });
    if (result.notFound) return res.status(404).json({ error: 'Customer not found' });

    // Return the refreshed statement so the client can re-render in one round-trip.
    const ledger = await getCustomerLedger(req.tenant.id, req.params.id);
    res.status(201).json({ entry: result.entry, ledger });
  } catch (err) {
    next(err);
  }
});

// POST /api/ledger/customers/:id/reminders — log a payment reminder action
router.post('/customers/:id/reminders', async (req, res, next) => {
  try {
    const { channel, note } = req.body || {};
    if (channel && !REMINDER_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Valid: ${REMINDER_CHANNELS.join(', ')}` });
    }

    const result = await addReminder(req.tenant.id, req.params.id, { channel, note });
    if (result.notFound) return res.status(404).json({ error: 'Customer not found' });

    res.status(201).json({ reminder: result.reminder, balance: result.balance });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
