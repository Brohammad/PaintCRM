const {
  inferRoomMoods,
  rankShadesHeuristic,
  roomMoodSummary,
} = require('../lib/ai/heuristic');

const catalog = [
  { id: 'a1', name: 'Warm Sand', brand: 'Dulux', hex: '#D8C098', pricePerL: 290, tags: ['warm', 'neutral'] },
  { id: 'a2', name: 'Peacock Teal', brand: 'Asian Paints', hex: '#287878', pricePerL: 320, tags: ['cool', 'bold'] },
  { id: 'a3', name: 'Mogra White', brand: 'Asian Paints', hex: '#F5F0E8', pricePerL: 320, tags: ['light', 'neutral', 'soft'] },
];

describe('ai/heuristic', () => {
  it('infers warm moods from a beige dominant colour', () => {
    const moods = inferRoomMoods({ r: 210, g: 190, b: 160 });
    expect(moods).toContain('warm');
    expect(moods).toContain('light');
  });

  it('ranks shades with mood overlap ahead of pure distance', () => {
    const base = { r: 245, g: 240, b: 232 };
    const out = rankShadesHeuristic(base, catalog, { limit: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('a3');
    expect(out[0].estimate?.totalInr).toBeGreaterThan(0);
  });

  it('summarises room moods for the hint line', () => {
    expect(roomMoodSummary(['warm', 'light'])).toMatch(/warm/);
  });
});
