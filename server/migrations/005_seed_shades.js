const fs = require('fs');
const path = require('path');

// shades.json stores tags as a space-separated string; the DB column is text[].
function toTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') return tags.split(/\s+/).filter(Boolean);
  return [];
}

exports.up = async (pgm) => {
  const shadesPath = path.join(__dirname, '../../paint-preview-app/shades.json');
  const shadesData = JSON.parse(fs.readFileSync(shadesPath, 'utf8'));

  for (const shade of shadesData) {
    await pgm.db.query(
      `INSERT INTO shades (id, name, brand, collection, hex, price_per_l, color_family, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        shade.id,
        shade.name,
        shade.brand || '',
        shade.collection || '',
        shade.hex || '',
        shade.pricePerL || 0,
        shade.colorFamily || '',
        toTags(shade.tags),
      ]
    );
  }

  console.log(`Seeded ${shadesData.length} shades`);
};

exports.down = async (pgm) => {
  await pgm.sql('DELETE FROM shades');
};
