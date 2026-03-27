const imageInput = document.getElementById("imageInput");
const exportBtn = document.getElementById("exportBtn");
const beforeAfterToggle = document.getElementById("beforeAfterToggle");
const compareToggle = document.getElementById("compareToggle");
const smartMaskToggle = document.getElementById("smartMaskToggle");
const naturalColorToggle = document.getElementById("naturalColorToggle");
const pickWallToggle = document.getElementById("pickWallToggle");
const resetWallBtn = document.getElementById("resetWallBtn");
const brushMaskToggle = document.getElementById("brushMaskToggle");
const clearBrushBtn = document.getElementById("clearBrushBtn");
const addZoneBtn = document.getElementById("addZoneBtn");
const removeZoneBtn = document.getElementById("removeZoneBtn");
const brushSizeSlider = document.getElementById("brushSizeSlider");
const opacitySlider = document.getElementById("opacitySlider");
const sensitivitySlider = document.getElementById("sensitivitySlider");

const canvasWrap = document.getElementById("canvasWrap");
const previewCanvas = document.getElementById("previewCanvas");
const compareCanvas = document.getElementById("compareCanvas");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const compareCtx = compareCanvas.getContext("2d", { willReadFrequently: true });

const suggestionsEl = document.getElementById("suggestions");
const compareSuggestionsEl = document.getElementById("compareSuggestions");
const zoneTabsEl = document.getElementById("zoneTabs");
const activeSwatchEl = document.getElementById("activeSwatch");
const activeShadeNameEl = document.getElementById("activeShadeName");
const activeShadeHexEl = document.getElementById("activeShadeHex");
const canvasHint = document.getElementById("canvasHint");
const maskStatusEl = document.getElementById("maskStatus");

const BASE_SWATCHES = [
  { name: "Signal Red", hex: "#FF1F1F" },
  { name: "Electric Blue", hex: "#0066FF" },
  { name: "Neon Green", hex: "#2CFF2C" },
  { name: "Vivid Yellow", hex: "#FFE600" },
  { name: "Hot Magenta", hex: "#FF00B8" },
  { name: "Bright Cyan", hex: "#00E5FF" },
  { name: "Deep Black", hex: "#0A0A0A" },
  { name: "Charcoal", hex: "#232323" },
  { name: "Pure White", hex: "#FDFDFD" }
];

const MAX_ZONES = 5;

const state = {
  originalImage: null,
  originalPixels: null,
  imageRect: null,
  shades: [],
  activeShade: null,
  compareShade: null,
  zones: [],
  activeZoneId: null,
  nextZoneId: 1,
  isBrushing: false
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
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

function rgbToHsl(r, g, b) {
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

function hslToRgb(h, s, l) {
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

function drawImageFit(ctx, image, canvas) {
  const canvasRatio = canvas.width / canvas.height;
  const imageRatio = image.width / image.height;
  let drawWidth;
  let drawHeight;

  if (imageRatio > canvasRatio) {
    drawWidth = canvas.width;
    drawHeight = canvas.width / imageRatio;
  } else {
    drawHeight = canvas.height;
    drawWidth = canvas.height * imageRatio;
  }

  const dx = (canvas.width - drawWidth) / 2;
  const dy = (canvas.height - drawHeight) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

  return { dx, dy, drawWidth, drawHeight };
}

function isLikelyWallPixel(r, g, b, sensitivity) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  return sat < clamp(sensitivity / 100, 0.1, 0.62) && brightness > 40 && brightness < 240;
}

function createCandidatesMap(pixels, sensitivity) {
  const { width, height, data } = pixels;
  const candidates = new Uint8Array(width * height);

  for (let p = 0, i = 0; p < candidates.length; p += 1, i += 4) {
    if (isLikelyWallPixel(data[i], data[i + 1], data[i + 2], sensitivity)) {
      candidates[p] = 1;
    }
  }

  return { width, height, candidates };
}

function growRegion(candidates, width, height, seeds) {
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

function smoothMask(mask, width, height) {
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
        out[y * width + x] = mode === "dilate" ? (active > 0 ? 1 : 0) : (active >= total ? 1 : 0);
      }
    }
    return out;
  }

  return morph(morph(mask, "dilate"), "erode");
}

function createAutoMask(pixels, sensitivity) {
  const { width, height, candidates } = createCandidatesMap(pixels, sensitivity);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let bestIndices = null;
  let bestScore = -1;

  for (let i = 0; i < candidates.length; i += 1) {
    if (!candidates[i] || visited[i]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let ySum = 0;
    const indices = [];

    queue[tail++] = i;
    visited[i] = 1;

    while (head < tail) {
      const cur = queue[head++];
      indices.push(cur);
      area += 1;
      ySum += Math.floor(cur / width);
      const x = cur % width;

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

    const score = area * clamp(1.35 - (ySum / area) / height, 0.2, 1.35);
    if (score > bestScore) {
      bestScore = score;
      bestIndices = indices;
    }
  }

  if (!bestIndices) {
    const seeds = [
      [Math.floor(width * 0.5), Math.floor(height * 0.2)],
      [Math.floor(width * 0.33), Math.floor(height * 0.25)],
      [Math.floor(width * 0.66), Math.floor(height * 0.25)]
    ];
    return smoothMask(growRegion(candidates, width, height, seeds), width, height);
  }

  const mask = new Uint8Array(width * height);
  bestIndices.forEach((idx) => {
    mask[idx] = 1;
  });

  for (let y = Math.floor(height * 0.84); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = 0;
    }
  }

  return smoothMask(mask, width, height);
}

function createSeedMask(pixels, sensitivity, seed) {
  const { width, height, candidates } = createCandidatesMap(pixels, sensitivity);
  const sx = clamp(Math.round(seed.x), 0, width - 1);
  const sy = clamp(Math.round(seed.y), 0, height - 1);
  if (!candidates[sy * width + sx]) return createAutoMask(pixels, sensitivity);
  return smoothMask(growRegion(candidates, width, height, [[sx, sy]]), width, height);
}

function averageColorSample(pixels) {
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
    b: Math.round(b / count)
  };
}

function buildSuggestions(base) {
  return BASE_SWATCHES
    .map((s) => {
      const rgb = hexToRgb(s.hex);
      return {
        ...s,
        d: Math.sqrt((base.r - rgb.r) ** 2 + (base.g - rgb.g) ** 2 + (base.b - rgb.b) ** 2)
      };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
}

function createZone(label, shadeHex) {
  return {
    id: state.nextZoneId++,
    label,
    shadeHex,
    seed: null,
    autoMask: null,
    autoSensitivity: null,
    manualMask: null,
    width: null,
    height: null
  };
}

function getActiveZone() {
  return state.zones.find((z) => z.id === state.activeZoneId) || null;
}

function ensureZoneBuffers(zone, pixels) {
  if (zone.width === pixels.width && zone.height === pixels.height && zone.manualMask) return;
  zone.width = pixels.width;
  zone.height = pixels.height;
  zone.manualMask = new Uint8Array(zone.width * zone.height);
  zone.autoMask = null;
  zone.autoSensitivity = null;
}

function hasManualMask(zone) {
  if (!zone.manualMask) return false;
  for (let i = 0; i < zone.manualMask.length; i += 1) {
    if (zone.manualMask[i]) return true;
  }
  return false;
}

function invalidateZoneAuto(zone) {
  zone.autoMask = null;
  zone.autoSensitivity = null;
}

function setControlsEnabled(enabled) {
  [
    exportBtn,
    beforeAfterToggle,
    compareToggle,
    smartMaskToggle,
    naturalColorToggle,
    pickWallToggle,
    resetWallBtn,
    brushMaskToggle,
    clearBrushBtn,
    addZoneBtn,
    removeZoneBtn,
    brushSizeSlider,
    opacitySlider,
    sensitivitySlider
  ].forEach((el) => {
    el.disabled = !enabled;
  });
}

function renderZoneTabs() {
  zoneTabsEl.innerHTML = "";
  state.zones.forEach((zone) => {
    const button = document.createElement("button");
    button.className = "zone-tab";
    if (zone.id === state.activeZoneId) button.classList.add("active");
    button.textContent = zone.label;
    button.addEventListener("click", () => setActiveZone(zone.id));
    zoneTabsEl.appendChild(button);
  });

  addZoneBtn.disabled = !state.originalImage || state.zones.length >= MAX_ZONES;
  removeZoneBtn.disabled = !state.originalImage || state.zones.length <= 1;
}

function updateMaskStatus() {
  const zone = getActiveZone();
  const name = zone ? zone.label : "Wall";

  if (!smartMaskToggle.checked) {
    maskStatusEl.textContent = `${name}: smart mask off`;
    maskStatusEl.classList.remove("locked");
    return;
  }

  if (brushMaskToggle.checked) {
    maskStatusEl.textContent = `${name}: brush mode active`;
    maskStatusEl.classList.add("locked");
    return;
  }

  if (pickWallToggle.checked) {
    maskStatusEl.textContent = `${name}: tap inside image`;
    maskStatusEl.classList.remove("locked");
    return;
  }

  if (zone && hasManualMask(zone)) {
    maskStatusEl.textContent = `${name}: manual brush mask`;
    maskStatusEl.classList.add("locked");
    return;
  }

  if (zone && zone.seed) {
    maskStatusEl.textContent = `${name}: locked from tap`;
    maskStatusEl.classList.add("locked");
    return;
  }

  maskStatusEl.textContent = `${name}: auto wall mode`;
  maskStatusEl.classList.remove("locked");
}

function renderSwatches(container, shades, onClick, activeHex) {
  container.innerHTML = "";
  shades.forEach((shade) => {
    const button = document.createElement("button");
    button.className = "swatch";
    if (shade.hex === activeHex) button.classList.add("active");
    button.style.background = shade.hex;
    button.title = `${shade.name} ${shade.hex}`;
    button.addEventListener("click", () => onClick(shade));
    container.appendChild(button);
  });
}

function setActiveShade(shade) {
  state.activeShade = shade;
  const zone = getActiveZone();
  if (zone) zone.shadeHex = shade.hex;

  activeSwatchEl.style.background = shade.hex;
  activeShadeNameEl.textContent = shade.name;
  activeShadeHexEl.textContent = shade.hex;
  renderSwatches(suggestionsEl, state.shades, setActiveShade, shade.hex);
  drawPreview();
}

function setCompareShade(shade) {
  state.compareShade = shade;
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, shade.hex);
  drawCompareIfEnabled();
}

function setActiveZone(zoneId) {
  state.activeZoneId = zoneId;
  const zone = getActiveZone();
  if (!zone) return;

  const shade = state.shades.find((s) => s.hex === zone.shadeHex) || state.shades[0];
  state.activeShade = shade;

  activeSwatchEl.style.background = shade.hex;
  activeShadeNameEl.textContent = shade.name;
  activeShadeHexEl.textContent = shade.hex;

  renderZoneTabs();
  renderSwatches(suggestionsEl, state.shades, setActiveShade, shade.hex);
  updateMaskStatus();
  drawPreview();
}

function getZoneMask(zone, pixels, sensitivity) {
  ensureZoneBuffers(zone, pixels);

  if (hasManualMask(zone)) return zone.manualMask;
  if (zone.autoMask && zone.autoSensitivity === sensitivity) return zone.autoMask;

  zone.autoMask = zone.seed
    ? createSeedMask(pixels, sensitivity, zone.seed)
    : createAutoMask(pixels, sensitivity);
  zone.autoSensitivity = sensitivity;
  return zone.autoMask;
}

function applyTint(data, width, height, mask, shadeRgb, opacity, useNatural) {
  const blend = opacity / 100;
  const target = useNatural ? rgbToHsl(shadeRgb.r, shadeRgb.g, shadeRgb.b) : null;

  for (let p = 0, i = 0; p < width * height; p += 1, i += 4) {
    if (!mask[p]) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (useNatural) {
      const src = rgbToHsl(r, g, b);
      const mapped = hslToRgb(
        target.h,
        clamp(src.s * 0.35 + target.s * 0.65, 0, 1),
        clamp(src.l * 0.9 + target.l * 0.1, 0, 1)
      );
      data[i] = Math.round(r * (1 - blend) + mapped.r * blend);
      data[i + 1] = Math.round(g * (1 - blend) + mapped.g * blend);
      data[i + 2] = Math.round(b * (1 - blend) + mapped.b * blend);
    } else {
      data[i] = Math.round(r * (1 - blend) + shadeRgb.r * blend);
      data[i + 1] = Math.round(g * (1 - blend) + shadeRgb.g * blend);
      data[i + 2] = Math.round(b * (1 - blend) + shadeRgb.b * blend);
    }
  }
}

function renderTinted(pixels, compareHex = null) {
  const opacity = Number(opacitySlider.value);
  const sensitivity = Number(sensitivitySlider.value);
  const useNatural = naturalColorToggle.checked;
  const data = new Uint8ClampedArray(pixels.data);

  if (!smartMaskToggle.checked) {
    const mask = new Uint8Array(pixels.width * pixels.height);
    for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
      if (isLikelyWallPixel(data[i], data[i + 1], data[i + 2], sensitivity)) {
        mask[p] = 1;
      }
    }
    applyTint(data, pixels.width, pixels.height, mask, hexToRgb(compareHex || state.activeShade.hex), opacity, useNatural);
    return new ImageData(data, pixels.width, pixels.height);
  }

  const occupied = new Uint8Array(pixels.width * pixels.height);
  for (const zone of state.zones) {
    const zoneMask = getZoneMask(zone, pixels, sensitivity);
    const uniqueMask = new Uint8Array(zoneMask.length);

    for (let i = 0; i < zoneMask.length; i += 1) {
      if (zoneMask[i] && !occupied[i]) {
        uniqueMask[i] = 1;
        occupied[i] = 1;
      }
    }

    const shadeHex = zone.id === state.activeZoneId && compareHex ? compareHex : zone.shadeHex;
    applyTint(data, pixels.width, pixels.height, uniqueMask, hexToRgb(shadeHex), opacity, useNatural);
  }

  return new ImageData(data, pixels.width, pixels.height);
}

function drawPreview() {
  if (!state.originalImage || !state.activeShade) return;

  const fit = drawImageFit(previewCtx, state.originalImage, previewCanvas);
  state.imageRect = fit;
  const pixels = previewCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  state.originalPixels = pixels;

  if (beforeAfterToggle.checked) {
    previewCtx.putImageData(pixels, fit.dx, fit.dy);
  } else {
    previewCtx.putImageData(renderTinted(pixels), fit.dx, fit.dy);
  }

  drawCompareIfEnabled();
}

function drawCompareIfEnabled() {
  if (!compareToggle.checked || !state.compareShade || !state.originalImage || !state.imageRect) {
    compareCanvas.classList.add("hidden");
    return;
  }

  compareCanvas.classList.remove("hidden");
  const fit = state.imageRect;
  compareCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
  compareCtx.drawImage(state.originalImage, fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);

  const pixels = state.originalPixels || compareCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  compareCtx.putImageData(renderTinted(pixels, state.compareShade.hex), fit.dx, fit.dy);
}

function getLocalPoint(event) {
  if (!state.imageRect || !state.originalPixels) return null;
  const rect = previewCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (previewCanvas.width / rect.width) - state.imageRect.dx);
  const y = Math.floor((event.clientY - rect.top) * (previewCanvas.height / rect.height) - state.imageRect.dy);
  if (x < 0 || y < 0 || x >= state.originalPixels.width || y >= state.originalPixels.height) return null;
  return { x, y };
}

function handleCanvasPick(event) {
  if (!pickWallToggle.checked || brushMaskToggle.checked) return;
  const zone = getActiveZone();
  if (!zone) return;

  const pt = getLocalPoint(event);
  if (!pt) {
    maskStatusEl.textContent = "Tap inside room image";
    return;
  }

  zone.seed = pt;
  ensureZoneBuffers(zone, state.originalPixels);
  zone.manualMask.fill(0);
  invalidateZoneAuto(zone);

  pickWallToggle.checked = false;
  canvasWrap.classList.remove("picking");
  updateMaskStatus();
  drawPreview();
}

function paintBrush(point) {
  const zone = getActiveZone();
  if (!zone || !state.originalPixels) return;

  ensureZoneBuffers(zone, state.originalPixels);
  const radius = Number(brushSizeSlider.value);

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = point.x + dx;
      const ny = point.y + dy;
      if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
      zone.manualMask[ny * zone.width + nx] = 1;
    }
  }

  zone.seed = null;
  invalidateZoneAuto(zone);
}

function onBrushDown(event) {
  if (!brushMaskToggle.checked) return;
  const pt = getLocalPoint(event);
  if (!pt) return;
  state.isBrushing = true;
  paintBrush(pt);
  drawPreview();
  event.preventDefault();
}

function onBrushMove(event) {
  if (!state.isBrushing || !brushMaskToggle.checked) return;
  const pt = getLocalPoint(event);
  if (!pt) return;
  paintBrush(pt);
  drawPreview();
  event.preventDefault();
}

function onBrushUp() {
  if (!state.isBrushing) return;
  state.isBrushing = false;
  updateMaskStatus();
}

function clearBrushMask() {
  const zone = getActiveZone();
  if (!zone || !state.originalPixels) return;
  ensureZoneBuffers(zone, state.originalPixels);
  zone.manualMask.fill(0);
  updateMaskStatus();
  drawPreview();
}

function resetWallSelection() {
  const zone = getActiveZone();
  if (!zone) return;

  zone.seed = null;
  if (zone.manualMask) zone.manualMask.fill(0);
  invalidateZoneAuto(zone);

  pickWallToggle.checked = false;
  brushMaskToggle.checked = false;
  canvasWrap.classList.remove("picking", "brushing");
  updateMaskStatus();
  drawPreview();
}

function addWallTab() {
  if (state.zones.length >= MAX_ZONES) return;
  const zone = createZone(`Wall ${state.zones.length + 1}`, state.activeShade.hex);
  state.zones.push(zone);
  setActiveZone(zone.id);
}

function removeActiveWallTab() {
  if (state.zones.length <= 1) return;
  const idx = state.zones.findIndex((z) => z.id === state.activeZoneId);
  if (idx === -1) return;
  state.zones.splice(idx, 1);
  setActiveZone(state.zones[Math.max(0, idx - 1)].id);
}

function initializeShadesFromImage() {
  const fit = drawImageFit(previewCtx, state.originalImage, previewCanvas);
  const pixels = previewCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  const dominant = averageColorSample(pixels);

  state.shades = buildSuggestions(dominant);
  state.activeShade = state.shades[0];
  state.compareShade = state.shades[1] || state.shades[0];

  state.zones = [createZone("Wall 1", state.activeShade.hex)];
  state.activeZoneId = state.zones[0].id;

  renderSwatches(suggestionsEl, state.shades, setActiveShade, state.activeShade.hex);
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, state.compareShade.hex);
  renderZoneTabs();

  activeSwatchEl.style.background = state.activeShade.hex;
  activeShadeNameEl.textContent = state.activeShade.name;
  activeShadeHexEl.textContent = state.activeShade.hex;

  setControlsEnabled(true);
  updateMaskStatus();
  canvasHint.classList.add("hidden");
  drawPreview();
}

function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.originalImage = img;
      initializeShadesFromImage();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function exportPreview() {
  if (!state.originalImage) return;
  const link = document.createElement("a");
  link.download = `paint-preview-${Date.now()}.png`;
  link.href = previewCanvas.toDataURL("image/png");
  link.click();
}

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleImageUpload(file);
});

opacitySlider.addEventListener("input", drawPreview);
sensitivitySlider.addEventListener("input", () => {
  state.zones.forEach((z) => invalidateZoneAuto(z));
  drawPreview();
});
beforeAfterToggle.addEventListener("change", drawPreview);
compareToggle.addEventListener("change", drawCompareIfEnabled);
smartMaskToggle.addEventListener("change", () => {
  if (!smartMaskToggle.checked) {
    pickWallToggle.checked = false;
    brushMaskToggle.checked = false;
    canvasWrap.classList.remove("picking", "brushing");
  }
  updateMaskStatus();
  drawPreview();
});
naturalColorToggle.addEventListener("change", drawPreview);

pickWallToggle.addEventListener("change", () => {
  if (pickWallToggle.checked) {
    brushMaskToggle.checked = false;
    canvasWrap.classList.remove("brushing");
  }
  canvasWrap.classList.toggle("picking", pickWallToggle.checked);
  updateMaskStatus();
});

brushMaskToggle.addEventListener("change", () => {
  if (brushMaskToggle.checked) {
    pickWallToggle.checked = false;
    canvasWrap.classList.remove("picking");
  }
  canvasWrap.classList.toggle("brushing", brushMaskToggle.checked);
  updateMaskStatus();
});

resetWallBtn.addEventListener("click", resetWallSelection);
clearBrushBtn.addEventListener("click", clearBrushMask);
addZoneBtn.addEventListener("click", addWallTab);
removeZoneBtn.addEventListener("click", removeActiveWallTab);

previewCanvas.addEventListener("click", handleCanvasPick);
previewCanvas.addEventListener("pointerdown", onBrushDown);
previewCanvas.addEventListener("pointermove", onBrushMove);
window.addEventListener("pointerup", onBrushUp);
window.addEventListener("pointercancel", onBrushUp);

exportBtn.addEventListener("click", exportPreview);
