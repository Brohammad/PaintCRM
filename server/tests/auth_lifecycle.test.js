const request = require('supertest');
const app = require('../app');

describe('Auth lifecycle — refresh, rotation, revocation', () => {
  beforeEach(async () => {
    await global.cleanDatabase();
  });

  async function register(email = 'life@shop.com', password = 'password123') {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ shopName: 'Lifecycle Shop', email, password });
    return res;
  }

  it('returns both an access token and a refresh token on register', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.expiresIn).toBeDefined();
    expect(res.body.token).not.toBe(res.body.refreshToken);
  });

  it('returns both tokens on login', async () => {
    await register('login2@shop.com');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login2@shop.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  describe('password policy', () => {
    it('rejects a password shorter than 8 chars', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ shopName: 'S', email: 'short@shop.com', password: 'ab12' });
      expect(res.status).toBe(400);
    });

    it('rejects a password with no digits', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ shopName: 'S', email: 'nodigit@shop.com', password: 'onlyletters' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/letter and one number/i);
    });

    it('accepts a compliant password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ shopName: 'S', email: 'good@shop.com', password: 'goodpass1' });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('exchanges a refresh token for a new access + refresh token', async () => {
      const reg = await register('refresh1@shop.com');
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(reg.body.refreshToken);
    });

    it('the new access token works against a protected route', async () => {
      const reg = await register('refresh2@shop.com');
      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.token}`);
      expect(me.status).toBe(200);
      expect(me.body.tenant.email).toBe('refresh2@shop.com');
    });

    it('rejects an unknown refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' });
      expect(res.status).toBe(401);
    });

    it('requires a refreshToken in the body', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('rotation + reuse detection', () => {
    it('invalidates the old refresh token after rotation', async () => {
      const reg = await register('rotate@shop.com');
      const old = reg.body.refreshToken;

      const first = await request(app).post('/api/auth/refresh').send({ refreshToken: old });
      expect(first.status).toBe(200);

      // Re-presenting the already-rotated token must fail.
      const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: old });
      expect(replay.status).toBe(401);
    });

    it('reusing a rotated token revokes the whole chain (reuse detection)', async () => {
      const reg = await register('reuse@shop.com');
      const old = reg.body.refreshToken;

      const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: old });
      const fresh = rotated.body.refreshToken;

      // Replay the compromised (old) token → triggers tenant-wide revocation.
      const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: old });
      expect(replay.status).toBe(401);

      // The freshly-issued token is now revoked too.
      const afterBreach = await request(app).post('/api/auth/refresh').send({ refreshToken: fresh });
      expect(afterBreach.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token on logout', async () => {
      const reg = await register('logout@shop.com');
      const rt = reg.body.refreshToken;

      const out = await request(app).post('/api/auth/logout').send({ refreshToken: rt });
      expect(out.status).toBe(200);

      const after = await request(app).post('/api/auth/refresh').send({ refreshToken: rt });
      expect(after.status).toBe(401);
    });

    it('logout-all revokes every session for the tenant', async () => {
      const reg = await register('logoutall@shop.com');
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'logoutall@shop.com', password: 'password123' });

      const out = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${reg.body.token}`);
      expect(out.status).toBe(200);

      const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.refreshToken });
      const r2 = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
      expect(r1.status).toBe(401);
      expect(r2.status).toBe(401);
    });

    it('logout-all requires authentication', async () => {
      const res = await request(app).post('/api/auth/logout-all');
      expect(res.status).toBe(401);
    });
  });
});
