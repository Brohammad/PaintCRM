// Refresh-token lifecycle: issue, rotate, and revoke.
// Access tokens are short-lived JWTs minted from a valid refresh token; the
// refresh token itself is an opaque random secret whose SHA-256 hash is the
// only thing persisted. Rotation revokes the presented token and links it to
// its replacement so a replayed (already-rotated) token trips reuse detection
// and nukes the whole tenant's sessions.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
const { JWT_SECRET } = require('../middleware/auth');

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function tenantFromRow(row) {
  return { id: row.id, email: row.email, shopName: row.shop_name };
}

function signAccessToken(tenant) {
  return jwt.sign(
    { id: tenant.id, email: tenant.email, shopName: tenant.shopName, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

async function issueRefreshToken(tenantId, userAgent = '') {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const inserted = await query(
    `INSERT INTO refresh_tokens (tenant_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenantId, hashToken(raw), (userAgent || '').toString().slice(0, 255), expiresAt]
  );
  return { raw, id: inserted.rows[0].id, expiresAt };
}

// Issues an access + refresh token pair for a freshly authenticated tenant.
async function issueSession(tenant, userAgent = '') {
  const refresh = await issueRefreshToken(tenant.id, userAgent);
  return {
    accessToken: signAccessToken(tenant),
    refreshToken: refresh.raw,
    accessTokenTtl: ACCESS_TTL,
  };
}

// Validates + rotates a refresh token. Returns { tenant, accessToken,
// refreshToken } on success or { error } where error is one of
// 'invalid' | 'expired' | 'reuse'.
async function rotateRefreshToken(raw, userAgent = '') {
  if (!raw || typeof raw !== 'string') return { error: 'invalid' };
  const found = await query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [hashToken(raw)]);
  if (found.rows.length === 0) return { error: 'invalid' };

  const row = found.rows[0];
  if (row.revoked_at) {
    await revokeAllForTenant(row.tenant_id);
    return { error: 'reuse' };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { error: 'expired' };
  }

  const tenantRes = await query(
    'SELECT id, email, shop_name FROM tenants WHERE id = $1',
    [row.tenant_id]
  );
  if (tenantRes.rows.length === 0) return { error: 'invalid' };
  const tenant = tenantFromRow(tenantRes.rows[0]);

  const next = await issueRefreshToken(row.tenant_id, userAgent);
  await query(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by = $2 WHERE id = $1',
    [row.id, next.id]
  );

  return { tenant, accessToken: signAccessToken(tenant), refreshToken: next.raw, accessTokenTtl: ACCESS_TTL };
}

async function revokeRefreshToken(raw) {
  if (!raw || typeof raw !== 'string') return;
  await query(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(raw)]
  );
}

async function revokeAllForTenant(tenantId) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND revoked_at IS NULL',
    [tenantId]
  );
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForTenant,
  hashToken,
  ACCESS_TTL,
  REFRESH_TTL_DAYS,
};
