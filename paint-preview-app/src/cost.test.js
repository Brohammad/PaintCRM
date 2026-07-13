import { describe, it, expect } from 'vitest';
import { estimatePaint, DEFAULT_ROOM_SQ_M } from './cost.js';

describe('estimatePaint', () => {
  it('uses the standard-room defaults (40 sq m, 2 coats, 11 sq m/L)', () => {
    // ceil((40 * 2) / 11) = ceil(7.27) = 8 litres.
    const est = estimatePaint({ pricePerL: 320 });
    expect(est.litres).toBe(8);
    expect(est.totalInr).toBe(8 * 320);
    expect(est.roomSqM).toBe(DEFAULT_ROOM_SQ_M);
    expect(est.coats).toBe(2);
  });

  it('rounds litres up to whole tins', () => {
    // ceil((10 * 1) / 11) = 1 litre even though the raw need is < 1.
    expect(estimatePaint({ pricePerL: 100, roomSqM: 10, coats: 1 }).litres).toBe(1);
  });

  it('scales with coats and room size', () => {
    const one = estimatePaint({ pricePerL: 100, roomSqM: 55, coats: 1, coveragePerL: 11 });
    const two = estimatePaint({ pricePerL: 100, roomSqM: 55, coats: 2, coveragePerL: 11 });
    expect(one.litres).toBe(5);
    expect(two.litres).toBe(10);
    expect(two.totalInr).toBe(1000);
  });

  it('returns null when the price is missing or non-positive', () => {
    expect(estimatePaint({ pricePerL: 0 })).toBeNull();
    expect(estimatePaint({})).toBeNull();
    expect(estimatePaint({ pricePerL: -5 })).toBeNull();
  });

  it('returns null when coverage is invalid', () => {
    expect(estimatePaint({ pricePerL: 100, coveragePerL: 0 })).toBeNull();
  });
});
