const request = require('supertest');
const app = require('../app');

describe('Quotes API', () => {
  let token;
  let customerId;
  let siteId;

  async function auth(overrides = {}) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Quote Shop',
        email: `quotes-${Date.now()}-${Math.random()}@shop.com`,
        password: 'password123',
        ...overrides,
      });
    return res.body.token;
  }

  beforeEach(async () => {
    await global.cleanDatabase();
    token = await auth();

    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Quote Customer', phone: '555-2020' });
    customerId = customerRes.body.customer.id;

    const siteRes = await request(app)
      .post('/api/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, name: '3BR Villa' });
    siteId = siteRes.body.site.id;
  });

  const sampleItems = [
    { description: 'Asian Paints Royale — White', brand: 'Asian Paints', quantity: 10, unitPrice: 250, unit: 'litre' },
    { description: 'Primer', quantity: 4, unitPrice: 150 },
  ];

  it('creates a quote and computes totals correctly', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, siteId, items: sampleItems, taxRate: 18, discount: 100 });

    expect(res.status).toBe(201);
    const q = res.body.quote;
    // subtotal = 10*250 + 4*150 = 2500 + 600 = 3100
    expect(q.subtotal).toBe(3100);
    // discounted base = 3100 - 100 = 3000; tax = 18% of 3000 = 540
    expect(q.taxAmount).toBe(540);
    expect(q.total).toBe(3540);
    expect(q.quoteNumber).toMatch(/^Q-\d{4}$/);
    expect(q.status).toBe('draft');
    expect(q.items).toHaveLength(2);
    expect(q.items[0].lineTotal).toBe(2500);
    expect(q.siteName).toBe('3BR Villa');
  });

  it('generates sequential quote numbers per tenant', async () => {
    const first = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const second = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });

    expect(first.body.quote.quoteNumber).toBe('Q-0001');
    expect(second.body.quote.quoteNumber).toBe('Q-0002');
  });

  it('rejects a quote with no line items', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a line item without a description', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: [{ quantity: 2, unitPrice: 50 }] });
    expect(res.status).toBe(400);
  });

  it('404s when the customer does not exist', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: '00000000-0000-4000-8000-000000000000', items: sampleItems });
    expect(res.status).toBe(404);
  });

  it('lists quotes and filters by status', async () => {
    await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });

    const listRes = await request(app)
      .get('/api/quotes')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.quotes).toHaveLength(1);
    expect(listRes.body.quotes[0].itemCount).toBe(2);

    const filtered = await request(app)
      .get('/api/quotes?status=sent')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.body.quotes).toHaveLength(0);
  });

  it('gets, updates, and re-computes a quote', async () => {
    const createRes = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.quote.id;

    const getRes = await request(app)
      .get(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.quote.customerName).toBe('Quote Customer');

    const updateRes = await request(app)
      .put(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ description: 'Single item', quantity: 1, unitPrice: 1000 }],
        taxRate: 0,
        discount: 0,
        status: 'sent',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.quote.total).toBe(1000);
    expect(updateRes.body.quote.items).toHaveLength(1);
    expect(updateRes.body.quote.status).toBe('sent');
  });

  it('updates quote status via PATCH', async () => {
    const createRes = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.quote.id;

    const res = await request(app)
      .patch(`/api/quotes/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe('accepted');

    const bad = await request(app)
      .patch(`/api/quotes/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'converted' });
    expect(bad.status).toBe(400);
  });

  it('converts a quote to an order and locks the quote', async () => {
    const createRes = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, siteId, items: sampleItems, taxRate: 18, discount: 100 });
    const id = createRes.body.quote.id;

    const convertRes = await request(app)
      .post(`/api/quotes/${id}/convert`)
      .set('Authorization', `Bearer ${token}`);
    expect(convertRes.status).toBe(201);
    const order = convertRes.body.order;
    expect(order.orderNumber).toMatch(/^O-\d{4}$/);
    expect(order.total).toBe(3540);
    expect(order.quoteId).toBe(id);
    expect(order.items).toHaveLength(2);

    // Quote is now converted
    const quoteRes = await request(app)
      .get(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(quoteRes.body.quote.status).toBe('converted');

    // Re-converting is rejected
    const again = await request(app)
      .post(`/api/quotes/${id}/convert`)
      .set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(409);

    // Editing a converted quote is rejected
    const edit = await request(app)
      .put(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: sampleItems });
    expect(edit.status).toBe(400);
  });

  it('deletes a quote', async () => {
    const createRes = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.quote.id;

    const delRes = await request(app)
      .delete(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('isolates quotes between tenants', async () => {
    const createRes = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.quote.id;

    const otherToken = await auth();
    const res = await request(app)
      .get(`/api/quotes/${id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/quotes');
    expect(res.status).toBe(401);
  });
});
