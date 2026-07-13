// Phase 6 — Commercial Modules: inventory basics + stock status.
// inventory_items holds per-tenant stock; inventory_movements is an append-only
// audit trail of quantity changes (received / issued / manual adjustment).

const MONEY = 'numeric(12,2)';

exports.up = async (pgm) => {
  pgm.createTable('inventory_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    sku: { type: 'varchar(64)', notNull: true, default: '' },
    name: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(120)', default: '' },
    shade_id: { type: 'varchar(64)', default: '' },
    unit: { type: 'varchar(32)', notNull: true, default: 'litre' },
    quantity: { type: MONEY, notNull: true, default: 0 },
    reorder_level: { type: MONEY, notNull: true, default: 0 },
    unit_price: { type: MONEY, notNull: true, default: 0 },
    cost_price: { type: MONEY, notNull: true, default: 0 },
    notes: { type: 'text', default: '' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('inventory_items', 'tenant_id');
  pgm.createIndex('inventory_items', ['tenant_id', 'name']);
  // SKU is optional; enforce uniqueness only when one is provided.
  pgm.createIndex('inventory_items', ['tenant_id', 'sku'], {
    unique: true,
    name: 'inventory_items_tenant_sku_unique',
    where: "sku <> ''",
  });

  pgm.createTable('inventory_movements', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    item_id: { type: 'uuid', notNull: true, references: 'inventory_items(id)', onDelete: 'CASCADE' },
    delta: { type: MONEY, notNull: true },
    reason: { type: 'varchar(255)', default: '' },
    balance_after: { type: MONEY, notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('inventory_movements', 'item_id');
  pgm.createIndex('inventory_movements', ['tenant_id', 'created_at']);
};

exports.down = async (pgm) => {
  pgm.dropTable('inventory_movements');
  pgm.dropTable('inventory_items');
};
