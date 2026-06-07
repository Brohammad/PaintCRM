exports.up = async (pgm) => {
  pgm.createTable('events', {
    id: { type: 'bigserial', primaryKey: true },
    tenant_id: { type: 'uuid', references: 'tenants(id)', onDelete: 'SET NULL' },
    session_id: { type: 'varchar(255)', default: '' },
    event_type: { type: 'varchar(50)', notNull: true },
    payload_json: { type: 'jsonb', default: '{}' },
    ip_address: { type: 'inet' },
    user_agent: { type: 'text', default: '' },
    ts: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  pgm.createIndex('events', 'tenant_id');
  pgm.createIndex('events', 'session_id');
  pgm.createIndex('events', 'event_type');
  pgm.createIndex('events', 'ts');
  pgm.createIndex('events', ['tenant_id', 'ts']);
  pgm.createIndex('events', ['tenant_id', 'event_type', 'ts']);
};

exports.down = async (pgm) => {
  pgm.dropTable('events');
};
