const jwt = require("jsonwebtoken");
const { query } = require("../lib/db");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches `req.tenant` = { id, email, shopName } on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: "No auth token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify tenant still exists in database
    const result = await query(
      'SELECT id, email, shop_name FROM tenants WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    
    req.tenant = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      shopName: result.rows[0].shop_name
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Optional auth — attaches req.tenant if token is valid, otherwise continues.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await query(
        'SELECT id, email, shop_name FROM tenants WHERE id = $1',
        [decoded.id]
      );
      
      if (result.rows.length > 0) {
        req.tenant = {
          id: result.rows[0].id,
          email: result.rows[0].email,
          shopName: result.rows[0].shop_name
        };
      }
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
