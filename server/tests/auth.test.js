const request = require('supertest');
const app = require('../app');

describe('Auth API', () => {
  beforeEach(async () => {
    await global.cleanDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new tenant successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Test Shop',
          dealerName: 'John Doe',
          phone: '+1234567890',
          email: 'test@shop.com',
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.tenant.email).toBe('test@shop.com');
      expect(res.body.tenant.shopName).toBe('Test Shop');
    });

    it('should reject duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'First Shop',
          email: 'dup@shop.com',
          password: 'password123'
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Second Shop',
          email: 'dup@shop.com',
          password: 'password123'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Test Shop',
          email: 'weak@shop.com',
          password: '12345'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Test Shop',
          email: 'login@shop.com',
          password: 'password123'
        });
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@shop.com',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@shop.com',
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let token;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Me Shop',
          email: 'me@shop.com',
          password: 'password123'
        });
      token = res.body.token;
    });

    it('should return tenant info with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tenant.email).toBe('me@shop.com');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
