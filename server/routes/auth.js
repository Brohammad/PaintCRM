const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();
const TOKEN_TTL = "30d";

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { shopName, dealerName, phone, email, password } = req.body || {};

  if (!shopName || !email || !password)
    return res.status(400).json({ error: "shopName, email, and password are required" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = db.prepare("SELECT id FROM tenants WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO tenants (id, shop_name, dealer_name, phone, email, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, shopName.trim(), (dealerName || "").trim(), (phone || "").trim(), email.toLowerCase().trim(), passwordHash);

  const tenant = db.prepare("SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = ?").get(id);
  const token = jwt.sign({ id, email: tenant.email, shopName: tenant.shop_name }, JWT_SECRET, { expiresIn: TOKEN_TTL });

  res.status(201).json({ token, tenant: formatTenant(tenant) });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  const row = db.prepare("SELECT * FROM tenants WHERE email = ?").get(email.toLowerCase());
  if (!row) return res.status(401).json({ error: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: row.id, email: row.email, shopName: row.shop_name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, tenant: formatTenant(row) });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const row = db.prepare("SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = ?").get(req.tenant.id);
  if (!row) return res.status(404).json({ error: "Tenant not found" });
  res.json({ tenant: formatTenant(row) });
});

function formatTenant(row) {
  return {
    id: row.id,
    shopName: row.shop_name,
    dealerName: row.dealer_name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
  };
}

module.exports = router;
