const request = require('supertest');
const app = require('../app');

describe('Pagination', () => {
  let token;

  async function auth() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Pager Shop',
        email: `pager-${Date.now()}-${Math.random()}@shop.com`,
        password: 'password123',
      });
    return res.body.token;
  }

  function createCustomer(i) {
    return request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Customer ${String(i).padStart(2, '0')}`, phone: `555-00${i}` });
  }

  beforeEach(async () => {
    await global.cleanDatabase();
    token = await auth();
    for (let i = 0; i < 5; i += 1) {
      await createCustomer(i);
    }
  });

  it('returns pagination metadata alongside the list', async () => {
    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(5);
    expect(res.body.pagination).toMatchObject({ total: 5, offset: 0, hasMore: false });
    expect(res.body.pagination.limit).toBeGreaterThan(0);
  });

  it('respects limit and offset and reports hasMore', async () => {
    const page1 = await request(app)
      .get('/api/customers?limit=2&offset=0')
      .set('Authorization', `Bearer ${token}`);
    expect(page1.body.customers).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({ total: 5, limit: 2, offset: 0, hasMore: true });

    const page3 = await request(app)
      .get('/api/customers?limit=2&offset=4')
      .set('Authorization', `Bearer ${token}`);
    expect(page3.body.customers).toHaveLength(1);
    expect(page3.body.pagination).toMatchObject({ total: 5, limit: 2, offset: 4, hasMore: false });
  });

  it('clamps an oversized limit to the max', async () => {
    const res = await request(app)
      .get('/api/customers?limit=99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(200);
  });

  it('falls back to defaults for invalid paging params', async () => {
    const res = await request(app)
      .get('/api/customers?limit=-5&offset=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.offset).toBe(0);
    expect(res.body.pagination.limit).toBeGreaterThan(0);
  });

  it('returns an empty page with total 0 past the end', async () => {
    const res = await request(app)
      .get('/api/customers?limit=10&offset=100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.customers).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.hasMore).toBe(false);
  });
});
