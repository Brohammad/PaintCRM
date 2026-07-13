const request = require('supertest');
const app = require('../app');

describe('Inventory API', () => {
  let token;

  async function auth() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Inventory Shop',
        email: `inv-${Date.now()}-${Math.random()}@shop.com`,
        password: 'password123',
      });
    return res.body.token;
  }

  beforeEach(async () => {
    await global.cleanDatabase();
    token = await auth();
  });

  function createItem(body) {
    return request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('creates an item and derives stock status', async () => {
    const res = await createItem({
      name: 'Royale White 10L', brand: 'Asian Paints', sku: 'AP-RW-10',
      unit: 'litre', quantity: 20, reorderLevel: 5, unitPrice: 250, costPrice: 180,
    });
    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe('in_stock');
    expect(res.body.item.quantity).toBe(20);
    expect(res.body.item.sku).toBe('AP-RW-10');
  });

  it('marks low and out of stock correctly', async () => {
    const low = await createItem({ name: 'Low Item', quantity: 4, reorderLevel: 5 });
    expect(low.body.item.status).toBe('low_stock');

    const out = await createItem({ name: 'Out Item', quantity: 0, reorderLevel: 5 });
    expect(out.body.item.status).toBe('out_of_stock');
  });

  it('requires a name', async () => {
    const res = await createItem({ brand: 'No Name' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate SKU', async () => {
    await createItem({ name: 'Item A', sku: 'DUP-1', quantity: 1 });
    const dup = await createItem({ name: 'Item B', sku: 'DUP-1', quantity: 1 });
    expect(dup.status).toBe(409);
  });

  it('allows multiple items with blank SKU', async () => {
    const a = await createItem({ name: 'Blank SKU A' });
    const b = await createItem({ name: 'Blank SKU B' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });

  it('lists items and filters by status', async () => {
    await createItem({ name: 'In', quantity: 10, reorderLevel: 2 });
    await createItem({ name: 'Low', quantity: 2, reorderLevel: 5 });
    await createItem({ name: 'Out', quantity: 0 });

    const all = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`);
    expect(all.body.items).toHaveLength(3);

    const low = await request(app).get('/api/inventory?status=low_stock').set('Authorization', `Bearer ${token}`);
    expect(low.body.items).toHaveLength(1);
    expect(low.body.items[0].name).toBe('Low');

    const out = await request(app).get('/api/inventory?status=out_of_stock').set('Authorization', `Bearer ${token}`);
    expect(out.body.items).toHaveLength(1);
    expect(out.body.items[0].name).toBe('Out');
  });

  it('searches items by name/brand/sku', async () => {
    await createItem({ name: 'Berger Silk', brand: 'Berger', sku: 'BG-1', quantity: 5 });
    await createItem({ name: 'Dulux Matt', brand: 'Dulux', sku: 'DX-1', quantity: 5 });

    const res = await request(app).get('/api/inventory?q=berger').set('Authorization', `Bearer ${token}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].brand).toBe('Berger');
  });

  it('adjusts stock up and down with an audit trail', async () => {
    const item = (await createItem({ name: 'Adjustable', quantity: 10, reorderLevel: 3 })).body.item;

    const received = await request(app)
      .post(`/api/inventory/${item.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 5, reason: 'Received shipment' });
    expect(received.status).toBe(200);
    expect(received.body.item.quantity).toBe(15);

    const issued = await request(app)
      .post(`/api/inventory/${item.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -13, reason: 'Sold' });
    expect(issued.status).toBe(200);
    expect(issued.body.item.quantity).toBe(2);
    expect(issued.body.item.status).toBe('low_stock');

    const detail = await request(app).get(`/api/inventory/${item.id}`).set('Authorization', `Bearer ${token}`);
    // opening (10) + received + issued = 3 movements
    expect(detail.body.item.movements).toHaveLength(3);
    expect(detail.body.item.movements[0].balanceAfter).toBe(2);
  });

  it('rejects an adjustment that would go negative', async () => {
    const item = (await createItem({ name: 'Small', quantity: 2 })).body.item;
    const res = await request(app)
      .post(`/api/inventory/${item.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a zero/invalid delta', async () => {
    const item = (await createItem({ name: 'Zero', quantity: 2 })).body.item;
    const res = await request(app)
      .post(`/api/inventory/${item.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: 0 });
    expect(res.status).toBe(400);
  });

  it('updates metadata without touching quantity', async () => {
    const item = (await createItem({ name: 'Editable', quantity: 8, reorderLevel: 2 })).body.item;
    const res = await request(app)
      .put(`/api/inventory/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', reorderLevel: 10, unitPrice: 300 });
    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('Renamed');
    expect(res.body.item.quantity).toBe(8);
    // qty 8 <= reorder 10 => now low
    expect(res.body.item.status).toBe('low_stock');
  });

  it('returns a stock summary', async () => {
    await createItem({ name: 'A', quantity: 10, reorderLevel: 2, costPrice: 100 });
    await createItem({ name: 'B', quantity: 2, reorderLevel: 5, costPrice: 50 });
    await createItem({ name: 'C', quantity: 0 });

    const res = await request(app).get('/api/inventory/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(3);
    expect(res.body.summary.inStock).toBe(1);
    expect(res.body.summary.lowStock).toBe(1);
    expect(res.body.summary.outOfStock).toBe(1);
    // stock value = 10*100 + 2*50 + 0 = 1100
    expect(res.body.summary.stockValue).toBe(1100);
  });

  it('deletes an item', async () => {
    const item = (await createItem({ name: 'Temp', quantity: 1 })).body.item;
    const del = await request(app).delete(`/api/inventory/${item.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/inventory/${item.id}`).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(404);
  });

  it('isolates inventory between tenants', async () => {
    const item = (await createItem({ name: 'Mine', quantity: 5 })).body.item;
    const otherToken = await auth();
    const res = await request(app).get(`/api/inventory/${item.id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
  });
});
