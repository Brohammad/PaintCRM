const request = require('supertest');
const app = require('../app');

describe('Dealer API', () => {
  let token;

  beforeEach(async () => {
    await global.cleanDatabase();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Dealer Shop',
        dealerName: 'Jane Doe',
        phone: '+10000000000',
        email: 'dealer@shop.com',
        password: 'password123',
      });

    token = res.body.token;
  });

  describe('GET /api/dealer', () => {
    it('should return the authenticated tenants profile', async () => {
      const res = await request(app)
        .get('/api/dealer')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.dealer.shopName).toBe('Dealer Shop');
      expect(res.body.dealer.email).toBe('dealer@shop.com');
      expect(res.body.dealer.id).toBeDefined();
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/dealer');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/dealer', () => {
    it('should update shopName and dealerName', async () => {
      const res = await request(app)
        .put('/api/dealer')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopName: 'Updated Shop', dealerName: 'Updated Name', phone: '+19999999999' });

      expect(res.status).toBe(200);
      expect(res.body.dealer.shopName).toBe('Updated Shop');
      expect(res.body.dealer.dealerName).toBe('Updated Name');
    });

    it('should require shopName', async () => {
      const res = await request(app)
        .put('/api/dealer')
        .set('Authorization', `Bearer ${token}`)
        .send({ dealerName: 'No Shop Name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/shopName/i);
    });

    it('should reject unauthenticated update', async () => {
      const res = await request(app)
        .put('/api/dealer')
        .send({ shopName: 'Hacked Shop' });

      expect(res.status).toBe(401);
    });

    it('should only update the authenticated tenants profile', async () => {
      // Create a second tenant
      const other = await request(app)
        .post('/api/auth/register')
        .send({ shopName: 'Other Dealer', email: 'other3@shop.com', password: 'password123' });

      // Update first tenant
      await request(app)
        .put('/api/dealer')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopName: 'Modified Shop' });

      // Second tenant profile should be unchanged
      const res = await request(app)
        .get('/api/dealer')
        .set('Authorization', `Bearer ${other.body.token}`);

      expect(res.body.dealer.shopName).toBe('Other Dealer');
    });
  });
});
