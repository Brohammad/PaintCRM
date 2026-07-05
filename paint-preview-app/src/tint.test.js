import { describe, it, expect } from 'vitest';
import {
  toAlphaMask,
  createFeatheredAlphaMask,
  applyTint,
  buildSuggestions,
} from './tint.js';

describe('toAlphaMask', () => {
  it('maps 0/1 to 0/255', () => {
    expect(Array.from(toAlphaMask(new Uint8Array([0, 1, 1, 0])))).toEqual([0, 255, 255, 0]);
  });
});

describe('createFeatheredAlphaMask', () => {
  it('is a hard alpha mask when the feather radius is zero', () => {
    const mask = new Uint8Array([0, 1, 1, 0]);
    expect(Array.from(createFeatheredAlphaMask(mask, 2, 2, 0))).toEqual([0, 255, 255, 0]);
  });

  it('leaves interior pixels fully opaque and softens boundary edges', () => {
    const w = 5;
    const h = 5;
    // Left three columns masked, right two unmasked -> a real edge at x=2.
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < 3; x += 1) mask[y * w + x] = 1;
    }
    const out = createFeatheredAlphaMask(mask, w, h, 1);
    // Interior masked column (x=1): whole neighbourhood is masked -> opaque.
    expect(out[2 * w + 1]).toBe(255);
    // Boundary masked column (x=2): neighbours at x=3 are unmasked -> softened.
    expect(out[2 * w + 2]).toBeLessThan(255);
    expect(out[2 * w + 2]).toBeGreaterThan(0);
  });

  it('never assigns alpha to unmasked pixels', () => {
    const w = 4;
    const h = 4;
    const mask = new Uint8Array(w * h);
    mask[w + 1] = 1; // single masked pixel
    const out = createFeatheredAlphaMask(mask, w, h, 1);
    for (let i = 0; i < out.length; i += 1) {
      if (!mask[i]) expect(out[i]).toBe(0);
    }
  });
});

describe('applyTint', () => {
  // Two RGBA pixels; only the first is masked.
  function twoPixels() {
    return new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
  }

  it('does nothing where alpha is zero', () => {
    const data = twoPixels();
    applyTint(data, 2, 1, new Uint8Array([0, 0]), { r: 255, g: 0, b: 0 }, 100, false);
    expect(Array.from(data)).toEqual(Array.from(twoPixels()));
  });

  it('replaces a fully-masked pixel at 100% opacity (direct blend)', () => {
    const data = twoPixels();
    applyTint(data, 2, 1, new Uint8Array([255, 0]), { r: 200, g: 50, b: 25 }, 100, false);
    expect([data[0], data[1], data[2]]).toEqual([200, 50, 25]);
    // Unmasked pixel is untouched.
    expect([data[4], data[5], data[6]]).toEqual([100, 100, 100]);
  });

  it('half-opacity blends halfway toward the shade', () => {
    const data = twoPixels();
    applyTint(data, 2, 1, new Uint8Array([255, 0]), { r: 200, g: 0, b: 0 }, 50, false);
    // 100*0.5 + 200*0.5 = 150 for red; green/blue: 100*0.5 + 0 = 50.
    expect([data[0], data[1], data[2]]).toEqual([150, 50, 50]);
  });

  it('natural mode keeps some original luminance rather than flat colour', () => {
    const data = twoPixels();
    applyTint(data, 2, 1, new Uint8Array([255, 0]), { r: 200, g: 50, b: 25 }, 100, true);
    // Result should differ from the raw shade because luminance is preserved.
    const isRawShade = data[0] === 200 && data[1] === 50 && data[2] === 25;
    expect(isRawShade).toBe(false);
  });
});

describe('buildSuggestions', () => {
  const catalog = [
    { id: 'a', name: 'Pure White', hex: '#ffffff' },
    { id: 'b', name: 'Jet Black', hex: '#000000' },
    { id: 'c', name: 'Pure Red', hex: '#ff0000' },
    { id: 'd', name: 'Mid Grey', hex: '#808080' },
    { id: 'e', name: 'Pure Green', hex: '#00ff00' },
    { id: 'f', name: 'Pure Blue', hex: '#0000ff' },
    { id: 'g', name: 'Off White', hex: '#f5f0e8' },
  ];

  it('ranks the nearest shade first', () => {
    const out = buildSuggestions({ r: 250, g: 250, b: 250 }, catalog);
    expect(out[0].id).toBe('a'); // white is closest to near-white
    expect(out[0].d).toBeLessThan(out[1].d);
  });

  it('caps the result at six suggestions', () => {
    const out = buildSuggestions({ r: 10, g: 10, b: 10 }, catalog);
    expect(out).toHaveLength(6);
  });

  it('returns an empty array for a missing catalog', () => {
    expect(buildSuggestions({ r: 0, g: 0, b: 0 })).toEqual([]);
  });
});
