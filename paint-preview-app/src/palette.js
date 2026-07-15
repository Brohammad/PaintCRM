// Smart palette recommendations: infer room mood from the dominant colour, rank
// catalog shades by colour distance + tag overlap, and attach paint estimates.

import { hexToRgb, rgbToHsl } from './color.js';
import { estimatePaint } from './cost.js';

// Reads the uploaded room's dominant colour and returns mood tags used to boost
// shades whose catalog tags overlap (warm/cool/neutral, light/dark, soft/bold).
export function inferRoomMoods(base) {
  const { h, s, l } = rgbToHsl(base.r, base.g, base.b);
  const moods = new Set();

  if (s < 0.14) moods.add('neutral');
  if (h < 55 || h >= 300) moods.add('warm');
  else if (h >= 170 && h < 270) moods.add('cool');

  if (l > 0.62) {
    moods.add('light');
    moods.add('pastel');
    moods.add('soft');
  } else if (l < 0.32) {
    moods.add('dark');
  }

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

function tagOverlapScore(moods, shade) {
  const shadeTags = shadeTagList(shade);
  if (!shadeTags.length || !moods.length) return 0;
  return moods.filter((m) => shadeTags.includes(m)).length;
}

function colorDistance(base, hex) {
  const rgb = hexToRgb(hex);
  return Math.sqrt(
    (base.r - rgb.r) ** 2 + (base.g - rgb.g) ** 2 + (base.b - rgb.b) ** 2,
  );
}

// Ranks catalog shades for this room. Lower `score` is a better match.
export function buildSmartSuggestions(base, catalog, { limit = 6 } = {}) {
  const moods = inferRoomMoods(base);

  return (catalog || [])
    .map((shade) => {
      const d = colorDistance(base, shade.hex);
      const overlap = tagOverlapScore(moods, shade);
      const score = d - overlap * 22;
      const matchedMoods = moods.filter((m) => shadeTagList(shade).includes(m));
      const estimate = shade.pricePerL
        ? estimatePaint({ pricePerL: shade.pricePerL })
        : null;

      return {
        ...shade,
        d,
        score,
        roomMoods: moods,
        moodLabel: matchedMoods.slice(0, 2).join(' · ') || null,
        estimate,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

// One-line hint for the smart palette panel.
export function roomMoodSummary(moods) {
  if (!moods?.length) return 'Analysing room colours…';
  const primary = moods.slice(0, 3).join(', ');
  return `Room reads ${primary} — shades below are ranked for this photo.`;
}
