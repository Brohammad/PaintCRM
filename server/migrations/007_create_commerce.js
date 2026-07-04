// Phase 6 — Commercial Modules: quote -> order basic flow.
// Adds quotes/quote_items and orders/order_items. Orders can be created
// standalone or converted from an accepted quote (quotes.status -> converted).

const MONEY = 'numeric(12,2)';

exports.up = async (pgm) => {
  pgm.createTable('quotes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers(id)', onDelete: 'CASCADE' },
    site_id: { type: 'uuid', references: 'sites(id)', onDelete: 'SET NULL' },
    quote_number: { type: 'varchar(32)', notNull: true },
    status: { type: 'varchar(32)', notNull: true, default: 'draft' },
    currency: { type: 'varchar(8)', notNull: true, default: 'INR' },
    notes: { type: 'text', default: '' },
    discount: { type: MONEY, notNull: true, default: 0 },
    tax_rate: { type: 'numeric(5,2)', notNull: true, default: 0 },
    subtotal: { type: MONEY, notNull: true, default: 0 },
    tax_amount: { type: MONEY, notNull: true, default: 0 },
    total: { type: MONEY, notNull: true, default: 0 },
    valid_until: { type: 'date' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('quotes', 'tenant_id');
  pgm.createIndex('quotes', ['tenant_id', 'customer_id']);
  pgm.createIndex('quotes', ['tenant_id', 'status']);
  pgm.addConstraint('quotes', 'quotes_tenant_number_unique', {
    unique: ['tenant_id', 'quote_number'],
  });

  pgm.createTable('quote_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    quote_id: { type: 'uuid', notNull: true, references: 'quotes(id)', onDelete: 'CASCADE' },
    shade_id: { type: 'varchar(64)', default: '' },
    description: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(120)', default: '' },
    unit: { type: 'varchar(32)', default: 'litre' },
    quantity: { type: MONEY, notNull: true, default: 1 },
    unit_price: { type: MONEY, notNull: true, default: 0 },
    line_total: { type: MONEY, notNull: true, default: 0 },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.createIndex('quote_items', 'quote_id');

  pgm.createTable('orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers(id)', onDelete: 'CASCADE' },
    site_id: { type: 'uuid', references: 'sites(id)', onDelete: 'SET NULL' },
    quote_id: { type: 'uuid', references: 'quotes(id)', onDelete: 'SET NULL' },
    order_number: { type: 'varchar(32)', notNull: true },
    status: { type: 'varchar(32)', notNull: true, default: 'pending' },
    currency: { type: 'varchar(8)', notNull: true, default: 'INR' },
    notes: { type: 'text', default: '' },
    discount: { type: MONEY, notNull: true, default: 0 },
    tax_rate: { type: 'numeric(5,2)', notNull: true, default: 0 },
    subtotal: { type: MONEY, notNull: true, default: 0 },
    tax_amount: { type: MONEY, notNull: true, default: 0 },
    total: { type: MONEY, notNull: true, default: 0 },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('orders', 'tenant_id');
  pgm.createIndex('orders', ['tenant_id', 'customer_id']);
  pgm.createIndex('orders', ['tenant_id', 'status']);
  pgm.createIndex('orders', 'quote_id');
  pgm.addConstraint('orders', 'orders_tenant_number_unique', {
    unique: ['tenant_id', 'order_number'],
  });

  pgm.createTable('order_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    order_id: { type: 'uuid', notNull: true, references: 'orders(id)', onDelete: 'CASCADE' },
    shade_id: { type: 'varchar(64)', default: '' },
    description: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(120)', default: '' },
    unit: { type: 'varchar(32)', default: 'litre' },
    quantity: { type: MONEY, notNull: true, default: 1 },
    unit_price: { type: MONEY, notNull: true, default: 0 },
    line_total: { type: MONEY, notNull: true, default: 0 },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.createIndex('order_items', 'order_id');
};

exports.down = async (pgm) => {
  pgm.dropTable('order_items');
  pgm.dropTable('orders');
  pgm.dropTable('quote_items');
  pgm.dropTable('quotes');
};
