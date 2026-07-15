import { describe, it, expect } from 'vitest';
import { inferRoomMoods, buildSmartSuggestions, roomMoodSummary } from './palette.js';

const catalog = [
  { id: '1', name: 'Warm Sand', hex: '#D8C098', pricePerL: 290, tags: 'sand beige tan warm' },
  { id: '2', name: 'Arctic Blue', hex: '#60A0C8', pricePerL: 275, tags: 'blue cool bold' },
  { id: '3', name: 'Mogra White', hex: '#F5F0E8', pricePerL: 320, tags: 'white neutral warm' },
];

describe('inferRoomMoods', () => {
  it('detects warm tones for a beige room', () => {
    const moods = inferRoomMoods({ r: 216, g: 192, b: 152 });
    expect(moods).toContain('warm');
    expect(moods).toContain('light');
  });

  it('detects cool tones for a blue room', () => {
    const moods = inferRoomMoods({ r: 40, g: 100, b: 180 });
    expect(moods).toContain('cool');
  });
});

describe('buildSmartSuggestions', () => {
  it('prefers tag-aligned shades over slightly closer mismatches', () => {
    const base = { r: 210, g: 185, b: 140 }; // warm beige
    const out = buildSmartSuggestions(base, catalog, { limit: 3 });
    expect(out[0].name).toBe('Warm Sand');
    expect(out[0].moodLabel).toBeTruthy();
  });

  it('attaches paint estimates when pricePerL is known', () => {
    const out = buildSmartSuggestions({ r: 200, g: 200, b: 200 }, catalog, { limit: 1 });
    expect(out[0].estimate).toMatchObject({ litres: expect.any(Number), totalInr: expect.any(Number) });
  });

  it('caps results at the requested limit', () => {
    expect(buildSmartSuggestions({ r: 128, g: 128, b: 128 }, catalog, { limit: 2 })).toHaveLength(2);
  });
});

describe('roomMoodSummary', () => {
  it('formats a readable hint', () => {
    expect(roomMoodSummary(['warm', 'light'])).toMatch(/warm/);
  });
});
