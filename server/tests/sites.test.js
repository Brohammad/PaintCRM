const request = require('supertest');
const app = require('../app');

describe('Sites API', () => {
  let token;
  let customerId;

  beforeEach(async () => {
    await global.cleanDatabase();

    const authRes = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Site Shop',
        email: 'sites@shop.com',
        password: 'password123',
      });

    token = authRes.body.token;

    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Site Owner',
        phone: '555-1010',
      });

    customerId = customerRes.body.customer.id;
  });

  it('should create and list sites for a customer', async () => {
    const createRes = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        name: '2BR Apartment — Kochi',
        address: 'Marine Drive',
        status: 'active',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.site.name).toContain('Kochi');

    const listRes = await request(app)
      .get(`/api/sites?customerId=${customerId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.sites).toHaveLength(1);
  });

  it('should attach site to lead when provided', async () => {
    const siteRes = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        name: 'Villa Project',
      });

    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Site Owner',
        phone: '555-1010',
        siteId: siteRes.body.site.id,
      });

    expect(leadRes.status).toBe(201);
    expect(leadRes.body.lead.siteId).toBe(siteRes.body.site.id);
  });
});
