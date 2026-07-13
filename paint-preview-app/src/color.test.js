import { describe, it, expect } from 'vitest';
import {
  clamp,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbDistanceSquared,
  getPixelColor,
} from './color.js';

describe('clamp', () => {
  it('clamps below, within, and above the range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex with or without a leading hash', () => {
    expect(hexToRgb('#ff8040')).toEqual({ r: 255, g: 128, b: 64 });
    expect(hexToRgb('ff8040')).toEqual({ r: 255, g: 128, b: 64 });
  });

  it('expands 3-digit shorthand', () => {
    expect(hexToRgb('#f84')).toEqual({ r: 255, g: 136, b: 68 });
  });

  it('handles pure black and white', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe('rgbToHsl / hslToRgb', () => {
  it('reports zero saturation for greys', () => {
    const hsl = rgbToHsl(128, 128, 128);
    expect(hsl.s).toBe(0);
    expect(hsl.h).toBe(0);
    expect(hsl.l).toBeCloseTo(128 / 255, 5);
  });

  it('computes the expected hue for primaries', () => {
    expect(rgbToHsl(255, 0, 0).h).toBeCloseTo(0, 5);
    expect(rgbToHsl(0, 255, 0).h).toBeCloseTo(120, 5);
    expect(rgbToHsl(0, 0, 255).h).toBeCloseTo(240, 5);
  });

  it('round-trips primary colours through HSL and back', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 18, g: 52, b: 86 },
    ]) {
      const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
      expect(hslToRgb(h, s, l)).toEqual(rgb);
    }
  });
});

describe('rgbDistanceSquared', () => {
  it('is zero for identical colours', () => {
    expect(rgbDistanceSquared({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0);
  });

  it('sums the squared channel deltas', () => {
    expect(rgbDistanceSquared({ r: 0, g: 0, b: 0 }, { r: 1, g: 2, b: 2 })).toBe(9);
  });
});

describe('getPixelColor', () => {
  it('reads the RGB triple at a coordinate from ImageData-shaped input', () => {
    // 2x1 image: pixel(0,0)=red, pixel(1,0)=green
    const pixels = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
    };
    expect(getPixelColor(pixels, 0, 0)).toEqual({ r: 255, g: 0, b: 0 });
    expect(getPixelColor(pixels, 1, 0)).toEqual({ r: 0, g: 255, b: 0 });
  });
});
