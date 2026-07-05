import { describe, it, expect } from 'vitest';
import {
  isWallLikeLabel,
  smoothMask,
  dilateMask,
  extractMaskFromSegmentation,
  fuseMasksWithMl,
  isLikelyWallPixel,
  createCandidatesMap,
  findNearestCandidate,
  growRegion,
  growRegionWithColorConstraint,
  createAutoMask,
  createSeedMask,
  averageColorSample,
} from './segmentation.js';

// Builds ImageData-shaped pixels from a per-pixel colour callback.
function makePixels(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function countSet(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) n += 1;
  return n;
}

describe('isWallLikeLabel', () => {
  it('matches wall/building/ceiling classes case-insensitively', () => {
    expect(isWallLikeLabel('wall')).toBe(true);
    expect(isWallLikeLabel('Building')).toBe(true);
    expect(isWallLikeLabel('CEILING')).toBe(true);
  });

  it('rejects non-wall classes', () => {
    expect(isWallLikeLabel('floor')).toBe(false);
    expect(isWallLikeLabel('person')).toBe(false);
    expect(isWallLikeLabel('sofa')).toBe(false);
  });
});

describe('dilateMask', () => {
  it('returns a copy when radius <= 0', () => {
    const mask = new Uint8Array([0, 1, 0, 0]);
    const out = dilateMask(mask, 2, 2, 0);
    expect(Array.from(out)).toEqual([0, 1, 0, 0]);
    expect(out).not.toBe(mask);
  });

  it('grows a single pixel into its neighbourhood', () => {
    // 3x3 grid, centre pixel set
    const mask = new Uint8Array(9);
    mask[4] = 1;
    const out = dilateMask(mask, 3, 3, 1);
    expect(countSet(out)).toBe(9);
  });
});

describe('smoothMask', () => {
  // smoothMask is dilate-then-erode (a morphological *closing*): it fills small
  // holes and preserves solid regions, rather than removing speckles.
  it('fills a single-pixel hole in a solid region', () => {
    const mask = new Uint8Array(25).fill(1);
    mask[12] = 0; // punch a hole in the centre of a 5x5 block
    const out = smoothMask(mask, 5, 5);
    expect(out[12]).toBe(1);
    expect(countSet(out)).toBe(25);
  });

  it('preserves a solid block', () => {
    const mask = new Uint8Array(25).fill(1);
    const out = smoothMask(mask, 5, 5);
    expect(countSet(out)).toBe(25);
  });
});

describe('extractMaskFromSegmentation', () => {
  it('returns null when there is no wall class in the legend', () => {
    const seg = {
      width: 2,
      height: 2,
      segmentationMap: new Uint8Array(2 * 2 * 4),
      legend: { floor: [10, 20, 30] },
    };
    expect(extractMaskFromSegmentation(seg, 2, 2)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(extractMaskFromSegmentation(null, 4, 4)).toBeNull();
    expect(extractMaskFromSegmentation({ width: 0 }, 4, 4)).toBeNull();
  });

  it('maps wall-coloured pixels into a scaled mask', () => {
    // 4x4 source, top half painted with the wall legend colour.
    const w = 4;
    const h = 4;
    const wallColor = [111, 22, 33];
    const map = new Uint8Array(w * h * 4);
    for (let p = 0; p < w * h; p += 1) {
      const y = Math.floor(p / w);
      if (y < 2) {
        map[p * 4] = wallColor[0];
        map[p * 4 + 1] = wallColor[1];
        map[p * 4 + 2] = wallColor[2];
      }
    }
    const seg = { width: w, height: h, segmentationMap: map, legend: { wall: wallColor } };
    const out = extractMaskFromSegmentation(seg, w, h);
    expect(out).not.toBeNull();
    // Smoothing may nibble edges, but the top rows should dominate the mask.
    let top = 0;
    let bottom = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (out[y * w + x]) (y < 2 ? (top += 1) : (bottom += 1));
      }
    }
    expect(top).toBeGreaterThan(bottom);
  });
});

describe('fuseMasksWithMl', () => {
  it('returns the heuristic mask unchanged when there is no ML mask', () => {
    const heuristic = new Uint8Array([1, 0, 1, 0]);
    expect(fuseMasksWithMl(heuristic, null, 2, 2)).toBe(heuristic);
  });

  it('keeps ML pixels and nearby heuristic pixels', () => {
    const w = 8;
    const h = 8;
    // Heuristic covers the whole top half; ML covers a small central patch.
    const heuristic = new Uint8Array(w * h);
    const ml = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (y < 4) heuristic[y * w + x] = 1;
        if (y >= 3 && y <= 4 && x >= 3 && x <= 4) ml[y * w + x] = 1;
      }
    }
    const fused = fuseMasksWithMl(heuristic, ml, w, h);
    expect(countSet(fused)).toBeGreaterThan(0);
  });
});

describe('isLikelyWallPixel', () => {
  it('accepts a flat, mid-brightness grey', () => {
    expect(isLikelyWallPixel(180, 180, 182, 50)).toBe(true);
  });

  it('rejects a highly saturated colour', () => {
    expect(isLikelyWallPixel(255, 0, 0, 50)).toBe(false);
  });

  it('rejects near-black and near-white', () => {
    expect(isLikelyWallPixel(5, 5, 5, 50)).toBe(false);
    expect(isLikelyWallPixel(250, 250, 250, 50)).toBe(false);
  });
});

describe('averageColorSample', () => {
  it('returns the uniform colour of a solid image', () => {
    const pixels = makePixels(48, 48, () => [120, 60, 30]);
    expect(averageColorSample(pixels)).toEqual({ r: 120, g: 60, b: 30 });
  });
});

describe('candidate map + region growing', () => {
  // A 40x40 image: flat grey wall on the top, noisy textured floor on the bottom.
  const w = 40;
  const h = 40;
  const pixels = makePixels(w, h, (x, y) => {
    if (y < h * 0.6) return [185, 185, 188];
    const n = (x * 7 + y * 13) % 60;
    return [40 + n, 60 + n, 30 + n];
  });

  it('favours the flat upper region over the textured floor', () => {
    const { candidates } = createCandidatesMap(pixels, 50);
    const topIdx = 5 * w + 20;
    expect(candidates[topIdx]).toBe(1);

    let top = 0;
    let bottom = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (candidates[y * w + x]) (y < h * 0.6 ? (top += 1) : (bottom += 1));
      }
    }
    expect(top).toBeGreaterThan(bottom);
  });

  it('findNearestCandidate returns the seed itself when already a candidate', () => {
    const { candidates } = createCandidatesMap(pixels, 50);
    const found = findNearestCandidate(candidates, w, h, 20, 5);
    expect(found).toEqual({ x: 20, y: 5 });
  });

  it('growRegion fills a connected candidate region from a seed', () => {
    const { candidates } = createCandidatesMap(pixels, 50);
    const mask = growRegion(candidates, w, h, [[20, 5]]);
    expect(countSet(mask)).toBeGreaterThan(100);
  });

  it('growRegionWithColorConstraint stays within the flat wall', () => {
    const { candidates } = createCandidatesMap(pixels, 50);
    const mask = growRegionWithColorConstraint(pixels, candidates, w, h, { x: 20, y: 5 }, 50);
    // No filled pixels should land in the noisy bottom band.
    let bottom = 0;
    for (let x = 0; x < w; x += 1) if (mask[38 * w + x]) bottom += 1;
    expect(bottom).toBe(0);
    expect(countSet(mask)).toBeGreaterThan(50);
  });

  it('createAutoMask selects the wall and excludes the floor band', () => {
    const mask = createAutoMask(pixels, 50);
    expect(mask.length).toBe(w * h);
    let top = 0;
    let bottom = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (mask[y * w + x]) (y < h * 0.6 ? (top += 1) : (bottom += 1));
      }
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(bottom);
  });

  it('createSeedMask returns a mask for a wall seed', () => {
    const mask = createSeedMask(pixels, 50, { x: 20, y: 5 });
    expect(mask.length).toBe(w * h);
    expect(countSet(mask)).toBeGreaterThan(0);
  });
});
