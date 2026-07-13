const request = require('supertest');
const app = require('../app');

describe('Orders API', () => {
  let token;
  let customerId;

  async function auth() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Order Shop',
        email: `orders-${Date.now()}-${Math.random()}@shop.com`,
        password: 'password123',
      });
    return res.body.token;
  }

  const sampleItems = [
    { description: 'Berger Silk — Beige', brand: 'Berger', quantity: 20, unitPrice: 300 },
  ];

  beforeEach(async () => {
    await global.cleanDatabase();
    token = await auth();

    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Order Customer', phone: '555-3030' });
    customerId = customerRes.body.customer.id;
  });

  it('creates an order directly with computed totals', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems, taxRate: 10 });

    expect(res.status).toBe(201);
    const order = res.body.order;
    // subtotal = 20*300 = 6000; tax = 10% = 600; total = 6600
    expect(order.subtotal).toBe(6000);
    expect(order.taxAmount).toBe(600);
    expect(order.total).toBe(6600);
    expect(order.orderNumber).toMatch(/^O-\d{4}$/);
    expect(order.status).toBe('pending');
    expect(order.quoteId).toBeNull();
  });

  it('lists orders and filters by status', async () => {
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });

    const listRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.orders).toHaveLength(1);
    expect(listRes.body.orders[0].itemCount).toBe(1);

    const filtered = await request(app)
      .get('/api/orders?status=fulfilled')
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.body.orders).toHaveLength(0);
  });

  it('gets an order with items', async () => {
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.order.id;

    const getRes = await request(app)
      .get(`/api/orders/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.order.customerName).toBe('Order Customer');
    expect(getRes.body.order.items).toHaveLength(1);
  });

  it('updates order status through the fulfillment flow', async () => {
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.order.id;

    const confirmRes = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.order.status).toBe('confirmed');

    const badRes = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'not-a-status' });
    expect(badRes.status).toBe(400);
  });

  it('deletes an order', async () => {
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, items: sampleItems });
    const id = createRes.body.order.id;

    const delRes = await request(app)
      .delete(`/api/orders/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/orders/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('404s when creating an order for an unknown customer', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: '00000000-0000-4000-8000-000000000000', items: sampleItems });
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });
});
