exports.up = async (pgm) => {
  pgm.createTable('tenants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    shop_name: { type: 'varchar(255)', notNull: true },
    dealer_name: { type: 'varchar(255)', default: '' },
    phone: { type: 'varchar(50)', default: '' },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  pgm.createIndex('tenants', 'email');
  pgm.createIndex('tenants', 'created_at');
};

exports.down = async (pgm) => {
  pgm.dropTable('tenants');
};
