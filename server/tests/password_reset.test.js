const request = require('supertest');
const { pool } = require('../lib/db');
const { hashToken } = require('../lib/tokens');
const app = require('../app');

describe('Password reset', () => {
  const email = 'reset@shop.com';
  const oldPassword = 'oldpass1';
  const newPassword = 'newpass2';

  beforeEach(async () => {
    await global.cleanDatabase();
    jest.restoreAllMocks();
  });

  async function registerUser(userEmail = email, password = oldPassword) {
    return request(app)
      .post('/api/auth/register')
      .send({ shopName: 'Reset Shop', email: userEmail, password });
  }

  function extractTokenFromConsoleLog() {
    const logCall = console.log.mock.calls.find(
      (args) => args[0] && String(args[0]).includes('[password-reset]')
    );
    if (!logCall) return null;
    const resetUrl = logCall[1];
    return new URL(resetUrl).searchParams.get('token');
  }

  describe('POST /api/auth/forgot-password', () => {
    it('returns the same response for unknown and known emails', async () => {
      await registerUser();

      const unknownRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@shop.com' });

      jest.spyOn(console, 'log').mockImplementation(() => {});

      const knownRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(unknownRes.status).toBe(200);
      expect(knownRes.status).toBe(200);
      expect(unknownRes.body).toEqual({
        message: 'If that email is registered, we sent reset instructions.',
      });
      expect(knownRes.body).toEqual(unknownRes.body);
    });

    it('creates a reset token for a known email', async () => {
      await registerUser();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      const rows = await pool.query(
        'SELECT * FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1'
      );
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].used_at).toBeNull();
      expect(new Date(rows.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('POST /api/auth/reset-password', () => {
    let refreshToken;

    async function requestResetToken() {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });
      return extractTokenFromConsoleLog();
    }

    beforeEach(async () => {
      const reg = await registerUser();
      refreshToken = reg.body.refreshToken;
    });

    it('rejects an expired token', async () => {
      const token = await requestResetToken();
      expect(token).toBeTruthy();

      await pool.query(
        `UPDATE password_reset_tokens
         SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
         WHERE token_hash = $1`,
        [hashToken(token)]
      );

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it('rejects a reused token', async () => {
      const token = await requestResetToken();

      const first = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'another1' });

      expect(second.status).toBe(400);
      expect(second.body.error).toMatch(/invalid or expired/i);
    });

    it('rejects a weak password', async () => {
      const token = await requestResetToken();

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/8 characters/i);
    });

    it('updates the password, revokes sessions, and rejects the old password', async () => {
      const token = await requestResetToken();

      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toMatch(/password updated/i);

      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: oldPassword });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: newPassword });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.token).toBeDefined();

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });
});
