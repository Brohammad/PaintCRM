exports.up = async (pgm) => {
  pgm.createTable('customers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(255)', notNull: true },
    phone: { type: 'varchar(50)', notNull: true },
    email: { type: 'varchar(255)', default: '' },
    notes: { type: 'text', default: '' },
    customer_type: { type: 'varchar(32)', default: 'end_customer' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('customers', 'tenant_id');
  pgm.createIndex('customers', ['tenant_id', 'phone']);
  pgm.createIndex('customers', ['tenant_id', 'name']);

  pgm.createTable('sites', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', notNull: true, references: 'customers(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(255)', notNull: true },
    address: { type: 'text', default: '' },
    status: { type: 'varchar(32)', default: 'active' },
    notes: { type: 'text', default: '' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('sites', 'tenant_id');
  pgm.createIndex('sites', 'customer_id');
  pgm.createIndex('sites', ['tenant_id', 'customer_id']);

  pgm.createTable('preview_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    customer_id: { type: 'uuid', references: 'customers(id)', onDelete: 'SET NULL' },
    site_id: { type: 'uuid', references: 'sites(id)', onDelete: 'SET NULL' },
    lead_id: { type: 'uuid', references: 'leads(id)', onDelete: 'SET NULL' },
    pilot_session_id: { type: 'varchar(64)', default: '' },
    session_type: { type: 'varchar(32)', notNull: true },
    summary: { type: 'varchar(500)', default: '' },
    shades_json: { type: 'jsonb', default: '[]' },
    snapshot_b64: { type: 'text', default: '' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
  });

  pgm.createIndex('preview_sessions', 'tenant_id');
  pgm.createIndex('preview_sessions', 'customer_id');
  pgm.createIndex('preview_sessions', ['tenant_id', 'customer_id', 'created_at']);
  pgm.createIndex('preview_sessions', 'pilot_session_id');

  pgm.addColumns('leads', {
    customer_id: { type: 'uuid', references: 'customers(id)', onDelete: 'SET NULL' },
    site_id: { type: 'uuid', references: 'sites(id)', onDelete: 'SET NULL' },
  });

  pgm.createIndex('leads', 'customer_id');
};

exports.down = async (pgm) => {
  pgm.dropColumns('leads', ['customer_id', 'site_id']);
  pgm.dropTable('preview_sessions');
  pgm.dropTable('sites');
  pgm.dropTable('customers');
};
