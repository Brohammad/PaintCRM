const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/dealer — get current tenant dealer profile
router.get("/", (req, res) => {
  const row = db.prepare(
    "SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = ?"
  ).get(req.tenant.id);
  if (!row) return res.status(404).json({ error: "Dealer not found" });
  res.json({ dealer: formatDealer(row) });
});

// PUT /api/dealer — update dealer profile (shop name, dealer name, phone)
router.put("/", (req, res) => {
  const { shopName, dealerName, phone } = req.body || {};

  if (!shopName) return res.status(400).json({ error: "shopName is required" });

  db.prepare(`
    UPDATE tenants SET shop_name = ?, dealer_name = ?, phone = ?
    WHERE id = ?
  `).run(shopName.trim(), (dealerName || "").trim(), (phone || "").trim(), req.tenant.id);

  const row = db.prepare(
    "SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = ?"
  ).get(req.tenant.id);
  res.json({ dealer: formatDealer(row) });
});

function formatDealer(row) {
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
