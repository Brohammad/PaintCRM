const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/shades — list all shades, with optional ?q= search
router.get("/", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();

  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT * FROM shades
      WHERE lower(name) LIKE ? OR lower(brand) LIKE ? OR lower(collection) LIKE ? OR lower(color_family) LIKE ?
      ORDER BY brand, name
    `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare("SELECT * FROM shades ORDER BY brand, name").all();
  }

  res.json({ shades: rows.map(formatShade), total: rows.length });
});

// GET /api/shades/:id — single shade
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM shades WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Shade not found" });
  res.json({ shade: formatShade(row) });
});

function formatShade(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    collection: row.collection,
    hex: row.hex,
    pricePerL: row.price_per_l,
    colorFamily: row.color_family,
  };
}

module.exports = router;
