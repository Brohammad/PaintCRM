const request = require('supertest');
const app = require('../app');

describe('Leads API', () => {
  let token;
  let tenantId;

  beforeEach(async () => {
    await global.cleanDatabase();
    
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Test Shop',
        email: 'leads@shop.com',
        password: 'password123'
      });
    
    token = res.body.token;
    tenantId = res.body.tenant.id;
  });

  describe('POST /api/leads', () => {
    it('should create a new lead', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Customer',
          phone: '555-1234',
          email: 'john@customer.com',
          notes: 'Interested in blue',
          shades: [{ wall: 'Wall 1', hex: '#ff0000', name: 'Red', brand: 'Brand' }]
        });

      expect(res.status).toBe(201);
      expect(res.body.lead.name).toBe('John Customer');
      expect(res.body.lead.shades).toHaveLength(1);
    });

    it('should require name and phone', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/leads', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Customer 1',
          phone: '555-1111'
        });
      
      await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Customer 2',
          phone: '555-2222'
        });
    });

    it('should list all leads for tenant', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.leads).toHaveLength(2);
    });

    it('should not show other tenant leads', async () => {
      // Create another tenant
      const other = await request(app)
        .post('/api/auth/register')
        .send({
          shopName: 'Other Shop',
          email: 'other@shop.com',
          password: 'password123'
        });

      const res = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${other.body.token}`);

      expect(res.body.leads).toHaveLength(0);
    });
  });

  describe('DELETE /api/leads/:id', () => {
    let leadId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'To Delete',
          phone: '555-9999'
        });
      leadId = res.body.lead.id;
    });

    it('should delete lead', async () => {
      const res = await request(app)
        .delete(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify deletion
      const list = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${token}`);
      
      expect(list.body.leads).toHaveLength(0);
    });
  });
});
