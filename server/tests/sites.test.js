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

  it('should require customerId and name', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Missing customer' });
    expect(res.status).toBe(400);
  });

  it('should reject an invalid status', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, name: 'Bad Status', status: 'nope' });
    expect(res.status).toBe(400);
  });

  it('should 404 when customer does not exist', async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: '00000000-0000-4000-8000-000000000000', name: 'Ghost Site' });
    expect(res.status).toBe(404);
  });

  it('should get, update, and delete a site', async () => {
    const createRes = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, name: 'Editable Site' });
    const siteId = createRes.body.site.id;

    const getRes = await request(app)
      .get(`/api/sites/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.site.customerName).toBeDefined();

    const updateRes = await request(app)
      .put(`/api/sites/${siteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Site', status: 'completed' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.site.name).toBe('Renamed Site');
    expect(updateRes.body.site.status).toBe('completed');

    const deleteRes = await request(app)
      .delete(`/api/sites/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const getAgain = await request(app)
      .get(`/api/sites/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAgain.status).toBe(404);
  });

  it('should list all sites for the tenant', async () => {
    await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, name: 'Site A' });

    const res = await request(app)
      .get('/api/sites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sites.length).toBeGreaterThanOrEqual(1);
  });
});
