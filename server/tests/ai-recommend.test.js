const {
  recommendShades,
  validateRecommendBody,
  parseOpenAiPicks,
  normalizeDominant,
} = require('../lib/ai/recommend');

const catalog = [
  { id: 's1', name: 'Warm Sand', brand: 'Dulux', hex: '#D8C098', pricePerL: 290, tags: ['warm', 'neutral'] },
  { id: 's2', name: 'Peacock Teal', brand: 'Asian Paints', hex: '#287878', pricePerL: 320, tags: ['cool', 'bold'] },
  { id: 's3', name: 'Mogra White', brand: 'Asian Paints', hex: '#F5F0E8', pricePerL: 320, tags: ['light', 'neutral', 'soft'] },
];

describe('ai/recommend', () => {
  describe('validateRecommendBody', () => {
    it('accepts valid dominant rgb and limit', () => {
      const out = validateRecommendBody({ dominant: { r: 10, g: 20, b: 30 }, limit: 4 });
      expect(out.dominant).toEqual({ r: 10, g: 20, b: 30 });
      expect(out.limit).toBe(4);
    });

    it('rejects invalid dominant', () => {
      expect(() => validateRecommendBody({ dominant: { r: -1, g: 0, b: 0 } })).toThrow(/0 and 255/);
    });
  });

  describe('parseOpenAiPicks', () => {
    it('parses picks from JSON content', () => {
      const picks = parseOpenAiPicks(JSON.stringify({
        picks: [{ id: 's1', reason: 'Warm and inviting for this room.' }],
      }));
      expect(picks).toEqual([{ id: 's1', reason: 'Warm and inviting for this room.' }]);
    });
  });

  describe('recommendShades', () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldEnabled = process.env.AI_RECOMMEND_ENABLED;

    afterEach(() => {
      process.env.OPENAI_API_KEY = oldKey;
      process.env.AI_RECOMMEND_ENABLED = oldEnabled;
    });

    it('returns heuristic suggestions when not authenticated', async () => {
      delete process.env.OPENAI_API_KEY;
      const out = await recommendShades({
        dominant: { r: 245, g: 240, b: 232 },
        catalog,
        limit: 2,
        authenticated: false,
      });
      expect(out.source).toBe('heuristic');
      expect(out.suggestions).toHaveLength(2);
    });

    it('uses OpenAI when authenticated and key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.AI_RECOMMEND_ENABLED = 'true';

      const fetchImpl = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                picks: [
                  { id: 's2', reason: 'Cool teal balances the warm walls.' },
                  { id: 's3', reason: 'Soft white keeps the room airy.' },
                ],
              }),
            },
          }],
        }),
      }));

      const out = await recommendShades({
        dominant: { r: 210, g: 190, b: 160 },
        prompt: 'coastal calm',
        catalog,
        limit: 2,
        authenticated: true,
        fetchImpl,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(out.source).toBe('openai');
      expect(out.suggestions[0].id).toBe('s2');
      expect(out.suggestions[0].reason).toMatch(/teal/i);
      expect(out.summary).toMatch(/coastal calm/i);
    });

    it('falls back to heuristic when OpenAI fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const fetchImpl = jest.fn(async () => ({
        ok: false,
        text: async () => 'rate limited',
      }));

      const out = await recommendShades({
        dominant: normalizeDominant({ r: 245, g: 240, b: 232 }),
        catalog,
        limit: 2,
        authenticated: true,
        fetchImpl,
      });

      expect(out.source).toBe('heuristic');
      expect(out.suggestions).toHaveLength(2);
    });
  });
});
