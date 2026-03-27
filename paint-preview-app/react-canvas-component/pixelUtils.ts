export type Rgb = { r: number; g: number; b: number };
export type SeedPoint = { x: number; y: number };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const normalized = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = (h * 60 + 360) % 360;
  }

  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

export function buildRegionMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seed: Rgb,
  tolerance: number,
  target?: Uint8Array
): Uint8Array {
  const out = target ?? new Uint8Array(width * height);
  const t = clamp(tolerance, 0, 255);
  const thresholdSq = t * t * 3;

  for (let p = 0, i = 0; p < out.length; p += 1, i += 4) {
    const dr = pixels[i] - seed.r;
    const dg = pixels[i + 1] - seed.g;
    const db = pixels[i + 2] - seed.b;
    const distanceSq = dr * dr + dg * dg + db * db;
    if (distanceSq <= thresholdSq) out[p] = 1;
  }

  return out;
}

export function mergeMasks(base: Uint8Array, additive: Uint8Array): Uint8Array {
  const out = new Uint8Array(base.length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = base[i] || additive[i] ? 1 : 0;
  }
  return out;
}

export function mergeMasksInPlace(target: Uint8Array, additive: Uint8Array): void {
  for (let i = 0; i < target.length; i += 1) {
    if (additive[i]) target[i] = 1;
  }
}

export function createEdgeMap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const lum = new Uint8Array(width * height);
  const edges = new Uint8Array(width * height);

  for (let p = 0, i = 0; p < lum.length; p += 1, i += 4) {
    lum[p] = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx =
        -lum[(y - 1) * width + (x - 1)] + lum[(y - 1) * width + (x + 1)] +
        -2 * lum[y * width + (x - 1)] + 2 * lum[y * width + (x + 1)] +
        -lum[(y + 1) * width + (x - 1)] + lum[(y + 1) * width + (x + 1)];
      const gy =
        -lum[(y - 1) * width + (x - 1)] - 2 * lum[(y - 1) * width + x] - lum[(y - 1) * width + (x + 1)] +
        lum[(y + 1) * width + (x - 1)] + 2 * lum[(y + 1) * width + x] + lum[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy) / 4;
      edges[idx] = clamp(Math.round(magnitude), 0, 255);
    }
  }

  return edges;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
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

export function buildHybridRegionMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seed: SeedPoint,
  tolerance: number,
  edgeMap: Uint8Array,
  edgeThreshold: number,
  mlMask: Uint8Array | null
): Uint8Array {
  const output = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const sx = clamp(seed.x, 0, width - 1);
  const sy = clamp(seed.y, 0, height - 1);
  const seedIdx = sy * width + sx;

  const seedOffset = seedIdx * 4;
  const sr = pixels[seedOffset];
  const sg = pixels[seedOffset + 1];
  const sb = pixels[seedOffset + 2];
  const thresholdSq = clamp(tolerance, 1, 255) ** 2 * 3;
  const hardEdge = clamp(edgeThreshold, 8, 255);
  const mlExpanded = mlMask ? dilateMask(mlMask, width, height, 2) : null;

  let head = 0;
  let tail = 0;
  queue[tail++] = seedIdx;
  visited[seedIdx] = 1;

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);
    const pxOffset = idx * 4;
    const dr = pixels[pxOffset] - sr;
    const dg = pixels[pxOffset + 1] - sg;
    const db = pixels[pxOffset + 2] - sb;
    const distanceSq = dr * dr + dg * dg + db * db;

    if (distanceSq > thresholdSq) continue;
    if (edgeMap[idx] > hardEdge) continue;

    if (mlMask && mlExpanded) {
      const inMlZone = mlMask[idx] || mlExpanded[idx];
      const veryCloseColor = distanceSq < thresholdSq * 0.45;
      if (!inMlZone && !veryCloseColor) continue;
    }

    output[idx] = 1;

    const n1 = x > 0 ? idx - 1 : -1;
    const n2 = x < width - 1 ? idx + 1 : -1;
    const n3 = y > 0 ? idx - width : -1;
    const n4 = y < height - 1 ? idx + width : -1;
    const neighbors = [n1, n2, n3, n4];

    for (let n = 0; n < neighbors.length; n += 1) {
      const next = neighbors[n];
      if (next < 0 || visited[next]) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }

  return output;
}

export function recolorWithHsl(
  source: ImageData,
  mask: Uint8Array,
  paintColorHex: string,
  showHighlight: boolean
): ImageData {
  const paintRgb = hexToRgb(paintColorHex);
  const paintHsl = rgbToHsl(paintRgb.r, paintRgb.g, paintRgb.b);
  const data = new Uint8ClampedArray(source.data);

  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (!mask[p]) continue;

    const srcHsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const mapped = hslToRgb(
      paintHsl.h,
      clamp(srcHsl.s * 0.35 + paintHsl.s * 0.65, 0, 1),
      srcHsl.l
    );

    data[i] = mapped.r;
    data[i + 1] = mapped.g;
    data[i + 2] = mapped.b;

    if (showHighlight) {
      data[i] = Math.round(data[i] * 0.75 + 20 * 0.25);
      data[i + 1] = Math.round(data[i + 1] * 0.75 + 180 * 0.25);
      data[i + 2] = Math.round(data[i + 2] * 0.75 + 255 * 0.25);
    }
  }

  return new ImageData(data, source.width, source.height);
}
