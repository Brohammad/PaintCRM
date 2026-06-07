exports.up = async (pgm) => {
  pgm.createTable('leads', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    name: { type: 'varchar(255)', notNull: true },
    phone: { type: 'varchar(50)', notNull: true },
    email: { type: 'varchar(255)', default: '' },
    notes: { type: 'text', default: '' },
    shades_json: { type: 'jsonb', default: '{}' },
    snapshot_b64: { type: 'text', default: '' },
    cost_estimate_json: { type: 'jsonb', default: '{}' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    synced_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  pgm.createIndex('leads', 'tenant_id');
  pgm.createIndex('leads', 'created_at');
  pgm.createIndex('leads', ['tenant_id', 'created_at']);
  pgm.createIndex('leads', 'phone');
};

exports.down = async (pgm) => {
  pgm.dropTable('leads');
};
