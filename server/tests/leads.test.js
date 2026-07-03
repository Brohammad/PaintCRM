const request = require('supertest');
const app = require('../app');

describe('Leads API', () => {
  let token;

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

    it('should upsert an existing lead', async () => {
      const createRes = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Original Name',
          phone: '555-0000',
        });

      const leadId = createRes.body.lead.id;
      expect(createRes.status).toBe(201);

      const updateRes = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: leadId,
          name: 'Updated Name',
          phone: '555-0000',
          notes: 'Follow up next week',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.lead.name).toBe('Updated Name');
      expect(updateRes.body.lead.notes).toBe('Follow up next week');
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

  describe('GET /api/leads/:id', () => {
    let leadId;
    const snapshot = 'data:image/png;base64,abc123';

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Snapshot Lead',
          phone: '555-0001',
          snapshotB64: snapshot,
        });
      leadId = res.body.lead.id;
    });

    it('should return lead with snapshot', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.lead.id).toBe(leadId);
      expect(res.body.lead.snapshotB64).toBe(snapshot);
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
