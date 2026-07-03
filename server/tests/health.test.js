const request = require('supertest');
const app = require('../app');

describe('Health endpoints', () => {
  it('GET /api/health returns status payload', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /api/live returns ok', async () => {
    const res = await request(app).get('/api/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alive: true });
  });
});
