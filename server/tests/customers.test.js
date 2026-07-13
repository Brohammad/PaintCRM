const request = require('supertest');
const app = require('../app');

describe('Customers API', () => {
  let token;

  beforeEach(async () => {
    await global.cleanDatabase();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'CRM Shop',
        email: 'crm@shop.com',
        password: 'password123',
      });

    token = res.body.token;
  });

  it('should create and list customers', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Priya Nair',
        phone: '+91 98765 43210',
        email: 'priya@example.com',
        customerType: 'end_customer',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.customer.name).toBe('Priya Nair');

    const listRes = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.customers).toHaveLength(1);
  });

  it('should auto-link lead to customer by phone', async () => {
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ravi Kumar',
        phone: '555-7777',
        shades: [{ wall: 'Wall 1', hex: '#ff0000', name: 'Red', brand: 'Brand' }],
      });

    expect(leadRes.status).toBe(201);
    expect(leadRes.body.lead.customerId).toBeDefined();

    const customersRes = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(customersRes.body.customers).toHaveLength(1);
    expect(customersRes.body.customers[0].phone).toBe('555-7777');
  });

  it('should return customer timeline with lead event', async () => {
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Timeline Test',
        phone: '555-8888',
      });

    const customerId = leadRes.body.lead.customerId;

    const timelineRes = await request(app)
      .get(`/api/customers/${customerId}/timeline`)
      .set('Authorization', `Bearer ${token}`);

    expect(timelineRes.status).toBe(200);
    expect(timelineRes.body.timeline.length).toBeGreaterThanOrEqual(1);
    expect(timelineRes.body.timeline[0].kind).toBe('lead_captured');
  });

  it('should require name and phone on create', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Phone' });
    expect(res.status).toBe(400);
  });

  it('should reject an invalid customerType', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Type', phone: '555-0002', customerType: 'alien' });
    expect(res.status).toBe(400);
  });

  it('should get, update, and delete a customer', async () => {
    const createRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Editable', phone: '555-5555' });
    const id = createRes.body.customer.id;

    const getRes = await request(app)
      .get(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .put(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Edited Name', phone: '555-5555', customerType: 'contractor' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.customer.name).toBe('Edited Name');
    expect(updateRes.body.customer.customerType).toBe('contractor');

    const deleteRes = await request(app)
      .delete(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const getAgain = await request(app)
      .get(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getAgain.status).toBe(404);
  });

  it('should search customers by query', async () => {
    await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Searchable Person', phone: '555-7001' });

    const res = await request(app)
      .get('/api/customers?q=Searchable')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.customers.some((c) => c.name === 'Searchable Person')).toBe(true);
  });

  it('should 404 timeline for unknown customer', async () => {
    const res = await request(app)
      .get('/api/customers/00000000-0000-4000-8000-000000000000/timeline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
