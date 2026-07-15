// Single-use password reset tokens. Only the SHA-256 hash of the raw secret is
// stored; the raw token is emailed once and never persisted.

exports.up = async (pgm) => {
  pgm.createTable('password_reset_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    token_hash: { type: 'varchar(64)', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createConstraint('password_reset_tokens', 'password_reset_tokens_hash_unique', {
    unique: ['token_hash'],
  });
  pgm.createIndex('password_reset_tokens', 'tenant_id');
  pgm.createIndex('password_reset_tokens', 'expires_at');
};

exports.down = async (pgm) => {
  pgm.dropTable('password_reset_tokens');
};
