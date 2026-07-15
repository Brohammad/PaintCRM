const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('./db');
const { hashToken, revokeAllForTenant } = require('./tokens');
const { passwordPolicyError } = require('./passwordPolicy');
const { sendMail, isSmtpConfigured } = require('./mail');

const DEFAULT_TTL_MINUTES = 60;

function getTtlMinutes() {
  const parsed = Number(process.env.PASSWORD_RESET_TTL_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MINUTES;
}

function buildResetUrl(rawToken) {
  const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}/login?token=${encodeURIComponent(rawToken)}`;
}

async function createToken(tenantId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + getTtlMinutes() * 60 * 1000);

  await query(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND used_at IS NULL`,
    [tenantId]
  );

  await query(
    `INSERT INTO password_reset_tokens (tenant_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [tenantId, hashToken(raw), expiresAt]
  );

  return { raw, expiresAt };
}

async function consumeToken(raw) {
  if (!raw || typeof raw !== 'string') return { error: 'invalid' };

  const result = await query(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING tenant_id`,
    [hashToken(raw)]
  );

  if (result.rows.length === 0) {
    return { error: 'invalid_or_expired' };
  }

  return { tenantId: result.rows[0].tenant_id };
}

async function deliverResetEmail({ tenant, resetUrl, log }) {
  const ttl = getTtlMinutes();
  const subject = 'Reset your PaintCRM password';
  const text =
    `We received a request to reset your PaintCRM password.\n\n` +
    `Use this link within ${ttl} minutes:\n${resetUrl}\n\n` +
    `If you did not request this, you can ignore this email.`;
  const html =
    `<p>We received a request to reset your PaintCRM password.</p>` +
    `<p><a href="${resetUrl}">Reset your password</a> (expires in ${ttl} minutes)</p>` +
    `<p>If you did not request this, you can ignore this email.</p>`;

  if (isSmtpConfigured()) {
    try {
      await sendMail({ to: tenant.email, subject, text, html });
    } catch (err) {
      log?.warn?.({
        event: 'password_reset_email_failed',
        tenantId: tenant.id,
        err: err.message,
      });
    }
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[password-reset] Reset URL (SMTP not configured):', resetUrl);
    return;
  }

  log?.warn?.({
    event: 'password_reset_email_skipped',
    reason: 'smtp_not_configured',
    tenantId: tenant.id,
  });
}

async function requestReset(email, log) {
  const normalizedEmail = email.toLowerCase().trim();

  const result = await query(
    'SELECT id, email FROM tenants WHERE email = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    log?.info?.({ event: 'password_reset_requested', found: false });
    return;
  }

  const tenant = result.rows[0];
  const { raw } = await createToken(tenant.id);
  const resetUrl = buildResetUrl(raw);

  log?.info?.({ event: 'password_reset_requested', found: true, tenantId: tenant.id });

  await deliverResetEmail({ tenant, resetUrl, log });
}

async function resetPassword(rawToken, password, log) {
  const pwError = passwordPolicyError(password);
  if (pwError) {
    log?.info?.({ event: 'password_reset_failed', reason: 'weak_password' });
    return { error: pwError };
  }

  let tenantId;

  try {
    tenantId = await withTransaction(async (client) => {
      const consumed = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         RETURNING tenant_id`,
        [hashToken(rawToken)]
      );

      if (consumed.rows.length === 0) {
        log?.info?.({ event: 'password_reset_failed', reason: 'invalid_or_expired' });
        return null;
      }

      const id = consumed.rows[0].tenant_id;
      const passwordHash = bcrypt.hashSync(password, 12);

      await client.query(
        'UPDATE tenants SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [passwordHash, id]
      );

      return id;
    });
  } catch (err) {
    log?.error?.({ event: 'password_reset_failed', reason: 'internal', err: err.message });
    throw err;
  }

  if (!tenantId) {
    return { error: 'Invalid or expired reset link. Please request a new one.' };
  }

  await revokeAllForTenant(tenantId);

  log?.info?.({ event: 'password_reset_completed', tenantId });
  return { ok: true };
}

module.exports = {
  createToken,
  consumeToken,
  requestReset,
  resetPassword,
  buildResetUrl,
  getTtlMinutes,
};
