const request = require('supertest');
const app = require('../app');

describe('Sessions API', () => {
  let token;

  beforeEach(async () => {
    await global.cleanDatabase();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Session Shop',
        email: 'sessions@shop.com',
        password: 'password123',
      });

    token = res.body.token;
  });

  it('should reject an invalid session type', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionType: 'not_a_type' });

    expect(res.status).toBe(400);
  });

  it('should record a session_start event without a customer', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionType: 'session_start',
        pilotSessionId: 'pilot-123',
        summary: 'Preview session started',
      });

    expect(res.status).toBe(201);
    expect(res.body.session.sessionType).toBe('session_start');
    expect(res.body.session.customerId).toBeNull();
  });

  it('should auto-link a shade_selected session to a customer by phone', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionType: 'shade_selected',
        name: 'Anita Menon',
        phone: '555-3030',
        shades: [{ hex: '#123456', name: 'Deep Teal' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.session.customerId).toBeTruthy();

    const customers = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(customers.body.customers.some((c) => c.phone === '555-3030')).toBe(true);
  });

  it('should list sessions, optionally filtered by customer', async () => {
    const created = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionType: 'shade_selected',
        name: 'Filter Test',
        phone: '555-4040',
        shades: [{ hex: '#abcdef', name: 'Sky' }],
      });

    const customerId = created.body.session.customerId;

    const all = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.sessions.length).toBeGreaterThanOrEqual(1);

    const filtered = await request(app)
      .get(`/api/sessions?customerId=${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.sessions.every((s) => s.customerId === customerId)).toBe(true);
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ sessionType: 'session_start' });

    expect(res.status).toBe(401);
  });
});
