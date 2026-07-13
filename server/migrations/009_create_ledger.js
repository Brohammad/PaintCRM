// Phase 6 — Commercial Modules: customer credit ledger + payment reminders.
// ledger_entries is an append-only, per-customer account of debits (charges /
// order totals the customer owes) and credits (payments / adjustments that
// reduce what they owe). Each row stores the running balance after it was
// applied so a statement can be rendered without re-summing. payment_reminders
// is an audit trail of follow-up actions taken against overdue balances.

const MONEY = 'numeric(12,2)';

exports.up = async (pgm) => {
  pgm.createTable('ledger_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers(id)', onDelete: 'CASCADE' },
    entry_type: { type: 'varchar(16)', notNull: true },
    amount: { type: MONEY, notNull: true },
    source: { type: 'varchar(32)', notNull: true, default: 'manual' },
    // Loose link to the originating document (e.g. an order). Not a strict FK so
    // the ledger survives deletion of the source and can span mixed sources.
    reference_id: { type: 'uuid' },
    reference_label: { type: 'varchar(64)', notNull: true, default: '' },
    note: { type: 'text', default: '' },
    // Due date applies to debits (invoices); used to derive overdue flags.
    due_date: { type: 'date' },
    balance_after: { type: MONEY, notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.addConstraint('ledger_entries', 'ledger_entries_type_check', {
    check: "entry_type IN ('debit', 'credit')",
  });
  pgm.addConstraint('ledger_entries', 'ledger_entries_amount_positive', {
    check: 'amount >= 0',
  });

  pgm.createIndex('ledger_entries', 'tenant_id');
  pgm.createIndex('ledger_entries', ['tenant_id', 'customer_id', 'created_at']);
  pgm.createIndex('ledger_entries', 'reference_id');

  pgm.createTable('payment_reminders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers(id)', onDelete: 'CASCADE' },
    channel: { type: 'varchar(32)', notNull: true, default: 'manual' },
    note: { type: 'text', default: '' },
    // Snapshot of the outstanding balance at the moment the reminder was logged.
    balance_at_reminder: { type: MONEY, notNull: true, default: 0 },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('payment_reminders', ['tenant_id', 'customer_id', 'created_at']);
};

exports.down = async (pgm) => {
  pgm.dropTable('payment_reminders');
  pgm.dropTable('ledger_entries');
};
