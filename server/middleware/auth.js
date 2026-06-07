const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches `req.tenant` = { id, email, shopName } on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No auth token" });

  try {
    req.tenant = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth — attaches req.tenant if token is valid, otherwise continues.
 * Used for routes that work both authenticated and anonymously.
 */
function optionalAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try { req.tenant = jwt.verify(token, JWT_SECRET); } catch { /* ignored */ }
  }
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
