// Server-side shade ranking (mirrors paint-preview-app/src/palette.js) so AI
// recommendations can fall back without calling an LLM.

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = (h * 60 + 360) % 360;
  }

  return { h, s, l };
}

function inferRoomMoods(base) {
  const { h, s, l } = rgbToHsl(base.r, base.g, base.b);
  const moods = new Set();

  if (s < 0.14) moods.add('neutral');
  if (h < 55 || h >= 300) moods.add('warm');
  else if (h >= 170 && h < 270) moods.add('cool');

  if (l > 0.62) {
    moods.add('light');
    moods.add('pastel');
    moods.add('soft');
  } else if (l < 0.32) moods.add('dark');

  if (s > 0.42) moods.add('bold');
  else if (s < 0.28) moods.add('soft');

  return [...moods];
}

function shadeTagList(shade) {
  if (Array.isArray(shade.tags)) return shade.tags.map((t) => String(t).toLowerCase());
  return String(shade.tags || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function colorDistance(base, hex) {
  const rgb = hexToRgb(hex);
  return Math.sqrt(
    (base.r - rgb.r) ** 2 + (base.g - rgb.g) ** 2 + (base.b - rgb.b) ** 2,
  );
}

function estimatePaint(pricePerL) {
  if (!pricePerL || pricePerL <= 0) return null;
  const litres = Math.ceil((40 * 2) / 11);
  return { litres, pricePerL, totalInr: litres * pricePerL, coats: 2, roomSqM: 40 };
}

function rankShadesHeuristic(base, catalog, { limit = 6 } = {}) {
  const moods = inferRoomMoods(base);

  return (catalog || [])
    .map((shade) => {
      const d = colorDistance(base, shade.hex);
      const overlap = moods.filter((m) => shadeTagList(shade).includes(m)).length;
      const score = d - overlap * 22;
      const matchedMoods = moods.filter((m) => shadeTagList(shade).includes(m));
      const estimate = estimatePaint(shade.pricePerL);

      return {
        ...shade,
        score,
        roomMoods: moods,
        moodLabel: matchedMoods.slice(0, 2).join(' · ') || null,
        estimate,
        reason: matchedMoods.length
          ? `Matches room mood: ${matchedMoods.slice(0, 2).join(', ')}`
          : 'Closest colour match to your wall',
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

function roomMoodSummary(moods) {
  if (!moods?.length) return 'Analysing room colours…';
  return `Room reads ${moods.slice(0, 3).join(', ')} — ranked for this photo.`;
}

module.exports = {
  inferRoomMoods,
  rankShadesHeuristic,
  roomMoodSummary,
  estimatePaint,
};
