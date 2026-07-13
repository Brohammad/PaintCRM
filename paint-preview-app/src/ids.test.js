import { describe, it, expect } from 'vitest';
import { generateLeadId, generateEventId } from './ids.js';

describe('generateLeadId', () => {
  it('produces a v4-shaped UUID', () => {
    expect(generateLeadId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('produces distinct ids', () => {
    expect(generateLeadId()).not.toBe(generateLeadId());
  });
});

describe('generateEventId', () => {
  it('is a non-empty base36 string', () => {
    expect(generateEventId()).toMatch(/^[0-9a-z]+$/);
  });

  it('produces distinct ids', () => {
    expect(generateEventId()).not.toBe(generateEventId());
  });
});
