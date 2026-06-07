const request = require('supertest');
const app = require('../app');

describe('Shades API', () => {
  // Shades are seeded by migration 005 and are read-only public data.
  // cleanDatabase() truncates shades but tests that depend on seed data must
  // tolerate an empty table in isolated test environments.

  describe('GET /api/shades', () => {
    it('should return a list of shades', async () => {
      const res = await request(app).get('/api/shades');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.shades)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('should accept a search query and return matching shades', async () => {
      // Insert a known shade so the test is deterministic even without seed data
      const { pool } = require('../lib/db');
      await pool.query(
        `INSERT INTO shades (id, name, brand, collection, hex, price_per_l, color_family, tags)
         VALUES ('TEST-001', 'Midnight Blue', 'TestBrand', 'Test Collection', '#001F3F', 4.50, 'blue', ARRAY['cool','dark'])
         ON CONFLICT (id) DO NOTHING`
      );

      const res = await request(app).get('/api/shades?q=midnight');

      expect(res.status).toBe(200);
      expect(res.body.shades.some((s) => s.name.toLowerCase().includes('midnight'))).toBe(true);
    });

    it('should return 200 with empty list when search matches nothing', async () => {
      const res = await request(app).get('/api/shades?q=xyznonexistent999');

      expect(res.status).toBe(200);
      expect(res.body.shades).toHaveLength(0);
    });
  });

  describe('GET /api/shades/:id', () => {
    it('should return a single shade by id', async () => {
      const { pool } = require('../lib/db');
      await pool.query(
        `INSERT INTO shades (id, name, brand, collection, hex, price_per_l, color_family, tags)
         VALUES ('TEST-002', 'Arctic White', 'TestBrand', 'Test Collection', '#F8F8FF', 3.99, 'white', ARRAY['neutral'])
         ON CONFLICT (id) DO NOTHING`
      );

      const res = await request(app).get('/api/shades/TEST-002');

      expect(res.status).toBe(200);
      expect(res.body.shade.id).toBe('TEST-002');
      expect(res.body.shade.name).toBe('Arctic White');
      expect(typeof res.body.shade.pricePerL).toBe('number');
    });

    it('should return 404 for unknown shade', async () => {
      const res = await request(app).get('/api/shades/DOES-NOT-EXIST');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });
});
