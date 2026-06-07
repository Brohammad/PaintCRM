exports.up = async (pgm) => {
  pgm.createTable('shades', {
    id: { type: 'varchar(50)', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    brand: { type: 'varchar(100)', default: '' },
    collection: { type: 'varchar(100)', default: '' },
    hex: { type: 'varchar(7)', default: '' },
    price_per_l: { type: 'decimal(10,2)', default: 0 },
    color_family: { type: 'varchar(50)', default: '' },
    tags: { type: 'text[]', default: '{}' },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });

  pgm.createIndex('shades', 'brand');
  pgm.createIndex('shades', 'color_family');
  pgm.createIndex('shades', ['name', 'brand', 'collection', 'color_family'], { 
    method: 'gin',
    name: 'shades_search_idx'
  });
};

exports.down = async (pgm) => {
  pgm.dropTable('shades');
};
