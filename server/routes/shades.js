const express = require("express");
const { query } = require("../lib/db");

const router = express.Router();

// GET /api/shades — list all shades, with optional ?q= search
router.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim().toLowerCase();

    let result;
    if (q) {
      // Multi-column search using ILIKE (case-insensitive)
      result = await query(
        `SELECT * FROM shades
         WHERE name ILIKE $1 OR brand ILIKE $1 OR collection ILIKE $1 OR color_family ILIKE $1
         ORDER BY brand, name`,
        [`%${q}%`]
      );
    } else {
      result = await query('SELECT * FROM shades ORDER BY brand, name');
    }

    res.json({ shades: result.rows.map(formatShade), total: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/shades/:id — single shade
router.get("/:id", async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM shades WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shade not found" });
    }
    
    res.json({ shade: formatShade(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

function formatShade(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    collection: row.collection,
    hex: row.hex,
    pricePerL: parseFloat(row.price_per_l) || 0,
    colorFamily: row.color_family,
    tags: row.tags || []
  };
}

module.exports = router;
