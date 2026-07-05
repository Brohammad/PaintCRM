// Wall-detection and mask-building heuristics. Everything here is pure: it
// operates on ImageData-shaped { width, height, data } inputs and typed-array
// masks, returning new masks without touching the DOM or canvas. This is the
// core of the "smart mask" feature and is the most algorithm-heavy part of the
// front end, so it lives in its own tested module.

import { clamp, getPixelColor, rgbDistanceSquared } from './color.js';

// Labels from the ML segmentation legend that we treat as paintable walls.
export function isWallLikeLabel(label) {
  return /wall|building|house|skyscraper|ceiling/i.test(label);
}

// Morphological open/close (dilate then erode) to remove speckle and close
// small holes in a binary mask.
export function smoothMask(mask, width, height) {
  function morph(src, mode) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let active = 0;
        let total = 0;
        for (let ny = y - 1; ny <= y + 1; ny += 1) {
          if (ny < 0 || ny >= height) continue;
          for (let nx = x - 1; nx <= x + 1; nx += 1) {
            if (nx < 0 || nx >= width) continue;
            total += 1;
            if (src[ny * width + nx]) active += 1;
          }
        }
        out[y * width + x] = mode === 'dilate' ? (active > 0 ? 1 : 0) : (active >= total ? 1 : 0);
      }
    }
    return out;
  }

  return morph(morph(mask, 'dilate'), 'erode');
}

// Grows a binary mask outward by `radius` pixels (square structuring element).
export function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return new Uint8Array(mask);
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      for (let ny = y - radius; ny <= y + radius; ny += 1) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - radius; nx <= x + radius; nx += 1) {
          if (nx < 0 || nx >= width) continue;
          out[ny * width + nx] = 1;
        }
      }
    }
  }

  return out;
}

// Converts a DeepLab segmentation result into a wall mask scaled to the target
// dimensions. Returns null when the result lacks a wall-like class.
export function extractMaskFromSegmentation(segmentation, targetWidth, targetHeight) {
  if (!segmentation || !segmentation.width || !segmentation.height || !segmentation.segmentationMap) {
    return null;
  }

  const srcWidth = segmentation.width;
  const srcHeight = segmentation.height;
  const srcMap = segmentation.segmentationMap;
  const legend = segmentation.legend || {};

  const wallColors = new Set();
  Object.entries(legend).forEach(([label, color]) => {
    if (!Array.isArray(color) || color.length < 3) return;
    if (!isWallLikeLabel(label)) return;
    wallColors.add(`${color[0]}:${color[1]}:${color[2]}`);
  });

  if (!wallColors.size || srcMap.length < srcWidth * srcHeight * 3) return null;

  const srcMask = new Uint8Array(srcWidth * srcHeight);
  for (let p = 0, i = 0; p < srcMask.length; p += 1, i += 4) {
    const key = `${srcMap[i]}:${srcMap[i + 1]}:${srcMap[i + 2]}`;
    if (wallColors.has(key)) srcMask[p] = 1;
  }

  const out = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(srcHeight - 1, Math.floor((y / targetHeight) * srcHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(srcWidth - 1, Math.floor((x / targetWidth) * srcWidth));
      out[y * targetWidth + x] = srcMask[sy * srcWidth + sx];
    }
  }

  return smoothMask(out, targetWidth, targetHeight);
}

// Combines the heuristic mask with the ML mask, keeping ML pixels plus heuristic
// pixels that are near the ML region or high in the frame. Falls back to the
// heuristic mask when fusion would discard too much of it.
export function fuseMasksWithMl(heuristicMask, mlMask, width, height) {
  if (!mlMask) return heuristicMask;
  const mlDilated = dilateMask(mlMask, width, height, 2);
  const fused = new Uint8Array(heuristicMask.length);
  let heuristicCount = 0;
  let fusedCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const h = heuristicMask[idx];
      const m = mlMask[idx];
      if (h) heuristicCount += 1;

      const keep = m || (h && (mlDilated[idx] || y < height * 0.52));
      if (keep) {
        fused[idx] = 1;
        fusedCount += 1;
      }
    }
  }

  if (!heuristicCount) return fused;
  if (fusedCount < heuristicCount * 0.25) return heuristicMask;
  return smoothMask(fused, width, height);
}

// Heuristic test for whether a pixel colour looks like a flat painted wall:
// low saturation and mid brightness.
export function isLikelyWallPixel(r, g, b, sensitivity) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  return sat < clamp(sensitivity / 100, 0.1, 0.62) && brightness > 40 && brightness < 240;
}

// Builds a refined candidate map of wall-like pixels using colour + local
// texture (edge energy), suppressing textured/floor regions.
export function createCandidatesMap(pixels, sensitivity) {
  const { width, height, data } = pixels;
  const candidates = new Uint8Array(width * height);
  const refined = new Uint8Array(width * height);
  const luminance = new Uint8Array(width * height);
  const texture = new Uint8Array(width * height);
  let textureSum = 0;

  for (let p = 0, i = 0; p < luminance.length; p += 1, i += 4) {
    luminance[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const l = luminance[idx];
      let delta = 0;
      let count = 0;

      if (x > 0) {
        delta += Math.abs(l - luminance[idx - 1]);
        count += 1;
      }
      if (x < width - 1) {
        delta += Math.abs(l - luminance[idx + 1]);
        count += 1;
      }
      if (y > 0) {
        delta += Math.abs(l - luminance[idx - width]);
        count += 1;
      }
      if (y < height - 1) {
        delta += Math.abs(l - luminance[idx + width]);
        count += 1;
      }

      texture[idx] = count > 0 ? Math.round(delta / count) : 0;
      textureSum += texture[idx];
    }
  }

  const textureMean = textureSum / texture.length;
  const maxTexture = clamp(textureMean * 1.75 + sensitivity * 0.45, 16, 62);
  const lowerBandTextureCutoff = clamp(textureMean * 1.25 + sensitivity * 0.3, 14, 44);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const wallLike = isLikelyWallPixel(data[i], data[i + 1], data[i + 2], sensitivity);
      const isTextured = texture[p] > maxTexture;
      const lowerBandLikelyFloor = y > height * 0.74 && texture[p] > lowerBandTextureCutoff;

      if (wallLike && !isTextured && !lowerBandLikelyFloor) {
        candidates[p] = 1;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      let active = 0;
      let total = 0;

      for (let ny = y - 1; ny <= y + 1; ny += 1) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (nx < 0 || nx >= width) continue;
          total += 1;
          if (candidates[ny * width + nx]) active += 1;
        }
      }

      if (candidates[idx]) {
        refined[idx] = active >= Math.min(3, total);
      } else {
        refined[idx] = active >= Math.min(5, total);
      }
    }
  }

  return { width, height, candidates: refined, texture };
}

// Finds the nearest candidate pixel to a seed point via expanding ring search.
export function findNearestCandidate(candidates, width, height, seedX, seedY, maxRadius = 28) {
  const sx = clamp(seedX, 0, width - 1);
  const sy = clamp(seedY, 0, height - 1);
  const seedIdx = sy * width + sx;
  if (candidates[seedIdx]) return { x: sx, y: sy };

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const left = Math.max(0, sx - radius);
    const right = Math.min(width - 1, sx + radius);
    const top = Math.max(0, sy - radius);
    const bottom = Math.min(height - 1, sy + radius);

    for (let x = left; x <= right; x += 1) {
      const topIdx = top * width + x;
      if (candidates[topIdx]) return { x, y: top };

      const bottomIdx = bottom * width + x;
      if (candidates[bottomIdx]) return { x, y: bottom };
    }

    for (let y = top + 1; y < bottom; y += 1) {
      const leftIdx = y * width + left;
      if (candidates[leftIdx]) return { x: left, y };

      const rightIdx = y * width + right;
      if (candidates[rightIdx]) return { x: right, y };
    }
  }

  return null;
}

// Flood fill from a seed, constrained by colour similarity to both the seed and
// the running mean of the region (keeps fills from bleeding across edges).
export function growRegionWithColorConstraint(pixels, candidates, width, height, seed, sensitivity) {
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const seedColor = getPixelColor(pixels, seed.x, seed.y);
  const seedTolerance = 35 + sensitivity * 1.1;
  const meanTolerance = 28 + sensitivity * 0.95;
  const seedToleranceSq = seedTolerance * seedTolerance;
  const meanToleranceSq = meanTolerance * meanTolerance;

  let head = 0;
  let tail = 0;
  let sumR = seedColor.r;
  let sumG = seedColor.g;
  let sumB = seedColor.b;
  let count = 1;

  const seedIdx = seed.y * width + seed.x;
  mask[seedIdx] = 1;
  queue[tail++] = seedIdx;

  while (head < tail) {
    const cur = queue[head++];
    const x = cur % width;
    const y = Math.floor(cur / width);

    const meanColor = {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count),
    };

    const neighbors = [
      x > 0 ? cur - 1 : -1,
      x < width - 1 ? cur + 1 : -1,
      y > 0 ? cur - width : -1,
      y < height - 1 ? cur + width : -1,
    ];

    for (let n = 0; n < neighbors.length; n += 1) {
      const idx = neighbors[n];
      if (idx < 0 || mask[idx] || !candidates[idx]) continue;

      const nx = idx % width;
      const ny = Math.floor(idx / width);
      const color = getPixelColor(pixels, nx, ny);
      if (rgbDistanceSquared(color, seedColor) > seedToleranceSq) continue;
      if (rgbDistanceSquared(color, meanColor) > meanToleranceSq) continue;

      mask[idx] = 1;
      queue[tail++] = idx;
      sumR += color.r;
      sumG += color.g;
      sumB += color.b;
      count += 1;
    }
  }

  return mask;
}

// Plain flood fill over the candidate map from one or more seed points.
export function growRegion(candidates, width, height, seeds) {
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  function seed(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (!candidates[idx] || mask[idx]) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  }

  seeds.forEach(([x, y]) => seed(x, y));

  while (head < tail) {
    const cur = queue[head++];
    const x = cur % width;
    const y = Math.floor(cur / width);

    if (x > 0) {
      const n = cur - 1;
      if (candidates[n] && !mask[n]) {
        mask[n] = 1;
        queue[tail++] = n;
      }
    }

    if (x < width - 1) {
      const n = cur + 1;
      if (candidates[n] && !mask[n]) {
        mask[n] = 1;
        queue[tail++] = n;
      }
    }

    if (y > 0) {
      const n = cur - width;
      if (candidates[n] && !mask[n]) {
        mask[n] = 1;
        queue[tail++] = n;
      }
    }

    if (y < height - 1) {
      const n = cur + width;
      if (candidates[n] && !mask[n]) {
        mask[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  return mask;
}

// Fully automatic wall selection: finds connected candidate components, scores
// them by area with a vertical/centre bias, and keeps the best few while
// dropping the bottom band (typically floor).
export function createAutoMask(pixels, sensitivity) {
  const { width, height, candidates } = createCandidatesMap(pixels, sensitivity);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];

  for (let i = 0; i < candidates.length; i += 1) {
    if (!candidates[i] || visited[i]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let ySum = 0;
    let xSum = 0;
    const indices = [];

    queue[tail++] = i;
    visited[i] = 1;

    while (head < tail) {
      const cur = queue[head++];
      indices.push(cur);
      area += 1;
      ySum += Math.floor(cur / width);
      const x = cur % width;
      xSum += x;

      if (x > 0) {
        const n = cur - 1;
        if (candidates[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }

      if (x < width - 1) {
        const n = cur + 1;
        if (candidates[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }

      if (cur - width >= 0) {
        const n = cur - width;
        if (candidates[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }

      if (cur + width < candidates.length) {
        const n = cur + width;
        if (candidates[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    if (area < Math.max(300, Math.floor(candidates.length * 0.004))) continue;

    const xNorm = (xSum / area) / width;
    const yNorm = (ySum / area) / height;

    if (yNorm > 0.78 && area < Math.floor(candidates.length * 0.35)) {
      continue;
    }

    const verticalBias = clamp(1.4 - yNorm, 0.25, 1.4);
    const centerBias = clamp(1.15 - Math.abs(xNorm - 0.5) * 1.6, 0.45, 1.15);
    const score = area * verticalBias * centerBias;
    components.push({ indices, score, area, yNorm });
  }

  if (!components.length) {
    const seeds = [
      [Math.floor(width * 0.5), Math.floor(height * 0.2)],
      [Math.floor(width * 0.33), Math.floor(height * 0.25)],
      [Math.floor(width * 0.66), Math.floor(height * 0.25)],
    ];
    return smoothMask(growRegion(candidates, width, height, seeds), width, height);
  }

  components.sort((a, b) => b.score - a.score);
  const best = components[0];
  const selected = [best];

  for (let i = 1; i < components.length && selected.length < 3; i += 1) {
    const candidate = components[i];
    if (candidate.score < best.score * 0.42) continue;
    if (candidate.area < best.area * 0.08) continue;
    if (candidate.yNorm > 0.72) continue;
    selected.push(candidate);
  }

  const mask = new Uint8Array(width * height);
  selected.forEach((component) => {
    component.indices.forEach((idx) => {
      mask[idx] = 1;
    });
  });

  for (let y = Math.floor(height * 0.84); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = 0;
    }
  }

  return smoothMask(mask, width, height);
}

// Seed-based wall selection (user clicked a point). Falls back to the automatic
// mask when the seed lands on a textured/floor region with no good candidate.
export function createSeedMask(pixels, sensitivity, seed) {
  const { width, height, candidates, texture } = createCandidatesMap(pixels, sensitivity);
  const sx = clamp(Math.round(seed.x), 0, width - 1);
  const sy = clamp(Math.round(seed.y), 0, height - 1);
  const resolvedSeed = findNearestCandidate(candidates, width, height, sx, sy);
  if (!resolvedSeed) return createAutoMask(pixels, sensitivity);

  const resolvedIdx = resolvedSeed.y * width + resolvedSeed.x;
  if (resolvedSeed.y > height * 0.72 && texture[resolvedIdx] > clamp(12 + sensitivity * 0.55, 16, 42)) {
    return createAutoMask(pixels, sensitivity);
  }

  const mask = growRegionWithColorConstraint(
    pixels,
    candidates,
    width,
    height,
    resolvedSeed,
    sensitivity,
  );
  return smoothMask(mask, width, height);
}

// Coarse average colour of an image, sampling on a sparse grid for speed.
export function averageColorSample(pixels) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = 0; y < pixels.height; y += 24) {
    for (let x = 0; x < pixels.width; x += 24) {
      const i = (y * pixels.width + x) * 4;
      r += pixels.data[i];
      g += pixels.data[i + 1];
      b += pixels.data[i + 2];
      count += 1;
    }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}
