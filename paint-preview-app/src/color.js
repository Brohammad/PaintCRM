// Low-level colour and pixel maths. Pure functions with no DOM/canvas access so
// the tint pipeline and wall-detection heuristics can be unit-tested directly.

// Clamps a number into the inclusive [min, max] range.
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Parses a #rgb or #rrggbb hex string into an { r, g, b } triple (0-255).
export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

// Converts RGB (0-255) to HSL with h in [0,360) and s,l in [0,1].
export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = (h * 60 + 360) % 360;
  }

  return { h, s, l };
}

// Converts HSL (h in degrees, s/l in [0,1]) back to RGB (0-255, rounded).
export function hslToRgb(h, s, l) {
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
    b: Math.round((b1 + m) * 255),
  };
}

// Squared Euclidean distance between two { r, g, b } colours. Squared to avoid
// the sqrt in hot loops where only relative distance matters.
export function rgbDistanceSquared(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

// Reads the RGB colour at (x, y) from an ImageData-shaped { width, data }.
export function getPixelColor(pixels, x, y) {
  const idx = (y * pixels.width + x) * 4;
  return {
    r: pixels.data[idx],
    g: pixels.data[idx + 1],
    b: pixels.data[idx + 2],
  };
}
