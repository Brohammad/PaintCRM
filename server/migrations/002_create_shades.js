exports.up = async (pgm) => {
  // pg_trgm is required for GIN indexes on varchar columns
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm');

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

  // Trigram GIN index for ILIKE full-text search across name/brand/collection/color_family
  pgm.sql(`
    CREATE INDEX shades_search_idx ON shades
    USING gin (
      name gin_trgm_ops,
      brand gin_trgm_ops,
      collection gin_trgm_ops,
      color_family gin_trgm_ops
    )
  `);
};

exports.down = async (pgm) => {
  pgm.dropTable('shades');
};
