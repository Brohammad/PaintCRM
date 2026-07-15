const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const {
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForTenant,
} = require('../lib/tokens');
const { passwordPolicyError } = require('../lib/passwordPolicy');
const { requestReset, resetPassword } = require('../lib/passwordReset');

const router = express.Router();

// Validation middleware
const validateRegistration = (req, res, next) => {
  const { shopName, email, password } = req.body || {};

  if (!shopName || !email || !password) {
    return res.status(400).json({ error: 'shopName, email, and password are required' });
  }

  const pwError = passwordPolicyError(password);
  if (pwError) {
    return res.status(400).json({ error: pwError });
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
    const session = await issueSession(
      { id, email: tenant.email, shopName: tenant.shop_name },
      req.headers['user-agent']
    );

    res.status(201).json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.accessTokenTtl,
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

    const session = await issueSession(
      { id: tenant.id, email: tenant.email, shopName: tenant.shop_name },
      req.headers['user-agent']
    );

    res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.accessTokenTtl,
      tenant: formatTenant(tenant)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — exchange a refresh token for a new access token.
// Rotates the refresh token (one-time use) and returns the replacement.
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const result = await rotateRefreshToken(refreshToken, req.headers['user-agent']);
    if (result.error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    res.json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.accessTokenTtl,
      tenant: formatTenant({
        id: result.tenant.id,
        email: result.tenant.email,
        shop_name: result.tenant.shopName,
      }),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — revoke a single refresh token (this session).
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout-all — revoke every active session for the tenant.
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await revokeAllForTenant(req.tenant.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    await requestReset(email, req.log);

    res.json({ message: 'If that email is registered, we sent reset instructions.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' });
    }

    const result = await resetPassword(token, password, req.log);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: 'Password updated. You can sign in.' });
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
