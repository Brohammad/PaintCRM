const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../lib/db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const TOKEN_TTL = '30d';

// Validation middleware
const validateRegistration = (req, res, next) => {
  const { shopName, email, password } = req.body || {};
  
  if (!shopName || !email || !password) {
    return res.status(400).json({ error: 'shopName, email, and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body || {};
  
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  
  next();
};

// POST /api/auth/register
router.post('/register', validateRegistration, async (req, res, next) => {
  try {
    const { shopName, dealerName, phone, email, password } = req.body;
    
    // Check for existing email
    const existing = await query(
      'SELECT id FROM tenants WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12); // Increased rounds for production
    
    await query(
      `INSERT INTO tenants (id, shop_name, dealer_name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, shopName.trim(), (dealerName || '').trim(), (phone || '').trim(), 
       email.toLowerCase().trim(), passwordHash]
    );
    
    const tenantResult = await query(
      'SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = $1',
      [id]
    );
    
    const tenant = tenantResult.rows[0];
    const token = jwt.sign(
      { id, email: tenant.email, shopName: tenant.shop_name },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    
    res.status(201).json({
      token,
      tenant: formatTenant(tenant)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const result = await query(
      'SELECT * FROM tenants WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const tenant = result.rows[0];
    const ok = bcrypt.compareSync(password, tenant.password_hash);
    
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login timestamp
    await query(
      'UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tenant.id]
    );
    
    const token = jwt.sign(
      { id: tenant.id, email: tenant.email, shopName: tenant.shop_name },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    
    res.json({
      token,
      tenant: formatTenant(tenant)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = $1',
      [req.tenant.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json({ tenant: formatTenant(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

function formatTenant(row) {
  return {
    id: row.id,
    shopName: row.shop_name,
    dealerName: row.dealer_name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at
  };
}

module.exports = router;
