const express = require("express");
const { query } = require("../lib/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/dealer — get current tenant dealer profile
router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = $1",
      [req.tenant.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dealer not found" });
    }
    
    res.json({ dealer: formatDealer(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/dealer — update dealer profile
router.put("/", async (req, res, next) => {
  try {
    const { shopName, dealerName, phone } = req.body || {};

    if (!shopName) {
      return res.status(400).json({ error: "shopName is required" });
    }

    await query(
      `UPDATE tenants 
       SET shop_name = $1, dealer_name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [shopName.trim(), (dealerName || "").trim(), (phone || "").trim(), req.tenant.id]
    );

    const result = await query(
      "SELECT id, shop_name, dealer_name, phone, email, created_at FROM tenants WHERE id = $1",
      [req.tenant.id]
    );
    
    res.json({ dealer: formatDealer(result.rows[0]) });
  } catch (err) {
    next(err);
  }
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
