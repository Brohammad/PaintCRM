const fs = require('fs');
const path = require('path');

exports.up = async (pgm) => {
  // Read shades.json
  const shadesPath = path.join(__dirname, '../../paint-preview-app/shades.json');
  const shadesData = JSON.parse(fs.readFileSync(shadesPath, 'utf8'));
  
  // Insert shades
  for (const shade of shadesData) {
    await pgm.sql(`
      INSERT INTO shades (id, name, brand, collection, hex, price_per_l, color_family, tags)
      VALUES ('${shade.id}', '${shade.name.replace(/'/g, "''")}', '${shade.brand || ''}', '${shade.collection || ''}', 
              '${shade.hex || ''}', ${shade.pricePerL || 0}, '${shade.colorFamily || ''}', 
              ARRAY[${(shade.tags || []).map(t => `'${t}'`).join(',')}])
      ON CONFLICT (id) DO NOTHING
    `);
  }
  
  console.log(`Seeded ${shadesData.length} shades`);
};

exports.down = async (pgm) => {
  await pgm.sql('DELETE FROM shades');
};
