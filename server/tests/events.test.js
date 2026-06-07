const request = require('supertest');
const app = require('../app');

describe('Events API', () => {
  let token;

  beforeEach(async () => {
    await global.cleanDatabase();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ shopName: 'Events Shop', email: 'events@shop.com', password: 'password123' });

    token = res.body.token;
  });

  describe('POST /api/events', () => {
    it('should record an anonymous event', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ eventType: 'session_start', sessionId: 'sess-001' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeDefined();
    });

    it('should record an authenticated event and attach tenant', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventType: 'shade_selected', sessionId: 'sess-002', payload: { shade: 'SW6119' } });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('should reject an unknown event type', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ eventType: 'totally_fake_event' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unknown event type/i);
    });

    it('should require eventType', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({ sessionId: 'sess-003' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/events/summary', () => {
    beforeEach(async () => {
      // Seed some events for this tenant
      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventType: 'session_start', sessionId: 'sess-a' });

      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventType: 'contact_saved', sessionId: 'sess-a' });
    });

    it('should return summary for authenticated tenant', async () => {
      const res = await request(app)
        .get('/api/events/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(typeof res.body.sessions).toBe('number');
      expect(typeof res.body.contactRate).toBe('number');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/events/summary');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/events', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventType: 'page_load', sessionId: 'sess-b' });
    });

    it('should return events list for authenticated tenant', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(401);
    });

    it('should not expose other tenants events', async () => {
      const other = await request(app)
        .post('/api/auth/register')
        .send({ shopName: 'Other Shop', email: 'other2@shop.com', password: 'password123' });

      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${other.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(0);
    });
  });
});
