const express = require('express');
const { query } = require('../lib/db');
const { optionalAuth } = require('../middleware/auth');
const { recommendShades, validateRecommendBody } = require('../lib/ai/recommend');

const router = express.Router();

function formatShade(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    collection: row.collection,
    hex: row.hex,
    pricePerL: parseFloat(row.price_per_l) || 0,
    colorFamily: row.color_family,
    tags: row.tags || [],
  };
}

// POST /api/ai/recommend-shades — smart palette (heuristic or OpenAI when signed in)
router.post('/recommend-shades', optionalAuth, async (req, res, next) => {
  try {
    const { dominant, prompt, limit } = req.body || {};
    const validated = validateRecommendBody({ dominant, limit });

    const result = await query('SELECT * FROM shades ORDER BY brand, name');
    const catalog = result.rows.map(formatShade);

    const out = await recommendShades({
      dominant: validated.dominant,
      prompt,
      catalog,
      limit: validated.limit,
      authenticated: Boolean(req.tenant),
    });

    res.json(out);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
