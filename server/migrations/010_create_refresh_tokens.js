// Auth lifecycle hardening: server-side refresh tokens.
// Access tokens are short-lived JWTs (~15m). Long-lived sessions are backed by
// opaque refresh tokens persisted here (only the SHA-256 hash is stored, never
// the raw secret). Rotation replaces the row on every refresh; revocation
// (logout / logout-all / reuse detection) sets revoked_at so the token can no
// longer mint access tokens.

exports.up = async (pgm) => {
  pgm.createTable('refresh_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)', onDelete: 'CASCADE' },
    // SHA-256 hex digest of the raw refresh token secret.
    token_hash: { type: 'varchar(64)', notNull: true },
    // Links a rotated token back to the one it replaced (reuse-detection chain).
    replaced_by: { type: 'uuid' },
    user_agent: { type: 'varchar(255)', notNull: true, default: '' },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createConstraint('refresh_tokens', 'refresh_tokens_hash_unique', {
    unique: ['token_hash'],
  });
  pgm.createIndex('refresh_tokens', 'tenant_id');
  pgm.createIndex('refresh_tokens', 'expires_at');
};

exports.down = async (pgm) => {
  pgm.dropTable('refresh_tokens');
};
