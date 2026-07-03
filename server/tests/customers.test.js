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
});
