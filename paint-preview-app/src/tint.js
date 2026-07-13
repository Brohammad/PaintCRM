// The paint-tinting pipeline: turning binary wall masks into feathered alpha
// masks and blending a shade onto the source pixels. Pure functions operating on
// typed arrays and plain colour objects, so the visual output is unit-testable
// without a real <canvas>.

import { clamp, hexToRgb, rgbToHsl, hslToRgb } from './color.js';

// Converts a 0/1 binary mask into a hard 0/255 alpha mask.
export function toAlphaMask(binaryMask) {
  const alphaMask = new Uint8Array(binaryMask.length);
  for (let i = 0; i < binaryMask.length; i += 1) {
    alphaMask[i] = binaryMask[i] ? 255 : 0;
  }
  return alphaMask;
}

// Softens mask edges by setting each masked pixel's alpha to the fraction of its
// neighbourhood that is also masked, giving a feathered border.
export function createFeatheredAlphaMask(binaryMask, width, height, featherRadius) {
  if (featherRadius <= 0) return toAlphaMask(binaryMask);

  const alphaMask = new Uint8Array(binaryMask.length);
  const radius = Math.max(1, featherRadius);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!binaryMask[idx]) {
        alphaMask[idx] = 0;
        continue;
      }

      let active = 0;
      let total = 0;
      for (let ny = y - radius; ny <= y + radius; ny += 1) {
        if (ny < 0 || ny >= height) continue;
        for (let nx = x - radius; nx <= x + radius; nx += 1) {
          if (nx < 0 || nx >= width) continue;
          total += 1;
          if (binaryMask[ny * width + nx]) active += 1;
        }
      }

      alphaMask[idx] = Math.round((active / total) * 255);
    }
  }

  return alphaMask;
}

// Blends `shadeRgb` onto the RGBA `data` buffer in place, weighted by per-pixel
// alpha and global opacity (0-100). When `useNatural` is set the shade's hue is
// applied while retaining much of the surface's original luminance/shading, for
// a more photorealistic repaint.
export function applyTint(data, width, height, alphaMask, shadeRgb, opacity, useNatural) {
  const blend = opacity / 100;
  const target = useNatural ? rgbToHsl(shadeRgb.r, shadeRgb.g, shadeRgb.b) : null;

  for (let p = 0, i = 0; p < width * height; p += 1, i += 4) {
    const localAlpha = alphaMask[p] / 255;
    if (localAlpha <= 0) continue;
    const localBlend = blend * localAlpha;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (useNatural) {
      const src = rgbToHsl(r, g, b);
      const mapped = hslToRgb(
        target.h,
        clamp(src.s * 0.35 + target.s * 0.65, 0, 1),
        clamp(src.l * 0.9 + target.l * 0.1, 0, 1),
      );
      data[i] = Math.round(r * (1 - localBlend) + mapped.r * localBlend);
      data[i + 1] = Math.round(g * (1 - localBlend) + mapped.g * localBlend);
      data[i + 2] = Math.round(b * (1 - localBlend) + mapped.b * localBlend);
    } else {
      data[i] = Math.round(r * (1 - localBlend) + shadeRgb.r * localBlend);
      data[i + 1] = Math.round(g * (1 - localBlend) + shadeRgb.g * localBlend);
      data[i + 2] = Math.round(b * (1 - localBlend) + shadeRgb.b * localBlend);
    }
  }
}

// Returns the six catalog shades closest (in RGB space) to a base colour,
// annotated with their distance `d`. Used to suggest palette matches for the
// dominant colour of an uploaded photo.
export function buildSuggestions(base, catalog) {
  return (catalog || [])
    .map((s) => {
      const rgb = hexToRgb(s.hex);
      return {
        ...s,
        d: Math.sqrt((base.r - rgb.r) ** 2 + (base.g - rgb.g) ** 2 + (base.b - rgb.b) ** 2),
      };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
}
