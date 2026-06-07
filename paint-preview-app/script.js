const imageInput = document.getElementById("imageInput");
const exportBtn = document.getElementById("exportBtn");
const beforeAfterToggle = document.getElementById("beforeAfterToggle");
const compareToggle = document.getElementById("compareToggle");
const mlAssistToggle = document.getElementById("mlAssistToggle");
const smartMaskToggle = document.getElementById("smartMaskToggle");
const naturalColorToggle = document.getElementById("naturalColorToggle");
const pickWallToggle = document.getElementById("pickWallToggle");
const resetWallBtn = document.getElementById("resetWallBtn");
const brushMaskToggle = document.getElementById("brushMaskToggle");
const brushEraseToggle = document.getElementById("brushEraseToggle");
const clearBrushBtn = document.getElementById("clearBrushBtn");
const undoMaskBtn = document.getElementById("undoMaskBtn");
const redoMaskBtn = document.getElementById("redoMaskBtn");
const addZoneBtn = document.getElementById("addZoneBtn");
const removeZoneBtn = document.getElementById("removeZoneBtn");
const brushSizeSlider = document.getElementById("brushSizeSlider");
const opacitySlider = document.getElementById("opacitySlider");
const sensitivitySlider = document.getElementById("sensitivitySlider");
const edgeFeatherSlider = document.getElementById("edgeFeatherSlider");

// Phase 2 conversion elements
const contactBtn = document.getElementById("contactBtn");
const leadsBtn = document.getElementById("leadsBtn");
const leadsCountEl = document.getElementById("leadsCount");
const restoreDraftBtn = document.getElementById("restoreDraftBtn");
const clearSessionBtn = document.getElementById("clearSessionBtn");

// Shade catalog + search
const shadeSearchInput = document.getElementById("shadeSearch");
const shadeSearchResults = document.getElementById("shadeSearchResults");
const activeShadeBrandEl = document.getElementById("activeShadeBrand");
const costEstimateEl = document.getElementById("costEstimate");
const costLitresEl = document.getElementById("costLitres");
const costTotalEl = document.getElementById("costTotal");

const contactModal = document.getElementById("contactModal");
const closeContactBtn = document.getElementById("closeContactBtn");
const cancelContactBtn = document.getElementById("cancelContactBtn");
const contactForm = document.getElementById("contactForm");
const leadNameInput = document.getElementById("leadName");
const leadPhoneInput = document.getElementById("leadPhone");
const leadEmailInput = document.getElementById("leadEmail");
const leadNotesInput = document.getElementById("leadNotes");
const leadShadesSummary = document.getElementById("leadShadesSummary");
const leadSnapshotCanvas = document.getElementById("leadSnapshotCanvas");

const leadsModal = document.getElementById("leadsModal");
const closeLeadsBtn = document.getElementById("closeLeadsBtn");
const closeLeads2Btn = document.getElementById("closeLeads2Btn");
const leadsListEl = document.getElementById("leadsList");
const clearAllLeadsBtn = document.getElementById("clearAllLeadsBtn");

const leadDetailModal = document.getElementById("leadDetailModal");
const closeDetailBtn = document.getElementById("closeDetailBtn");
const leadDetailBody = document.getElementById("leadDetailBody");
const deleteLeadBtn = document.getElementById("deleteLeadBtn");
const exportLeadBtn = document.getElementById("exportLeadBtn");

const canvasWrap = document.getElementById("canvasWrap");
const previewCanvas = document.getElementById("previewCanvas");
const compareCanvas = document.getElementById("compareCanvas");
const brushCursorCanvas = document.getElementById("brushCursorCanvas");
const compareHandle = document.getElementById("compareHandle");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const compareCtx = compareCanvas.getContext("2d", { willReadFrequently: true });
const brushCursorCtx = brushCursorCanvas.getContext("2d");

const suggestionsEl = document.getElementById("suggestions");
const compareSuggestionsEl = document.getElementById("compareSuggestions");
const zoneTabsEl = document.getElementById("zoneTabs");
const activeSwatchEl = document.getElementById("activeSwatch");
const activeShadeNameEl = document.getElementById("activeShadeName");
const activeShadeHexEl = document.getElementById("activeShadeHex");
const canvasHint = document.getElementById("canvasHint");
const maskStatusEl = document.getElementById("maskStatus");
const mlStatusEl = document.getElementById("mlStatus");

// Populated from shades.json at startup; fallback used if fetch fails
let SHADE_CATALOG = [];

const FALLBACK_SWATCHES = [
  { id: "f1", name: "Mogra White",   brand: "Asian Paints", collection: "Royale", hex: "#F5F0E8", pricePerL: 320 },
  { id: "f2", name: "Warm Sand",     brand: "Dulux",        collection: "Silk",   hex: "#D8C098", pricePerL: 290 },
  { id: "f3", name: "Fired Earth",   brand: "Dulux",        collection: "Silk",   hex: "#B85840", pricePerL: 290 },
  { id: "f4", name: "Peacock Teal",  brand: "Asian Paints", collection: "Royale", hex: "#287878", pricePerL: 320 },
  { id: "f5", name: "Midnight Navy", brand: "Asian Paints", collection: "Royale", hex: "#102050", pricePerL: 320 },
  { id: "f6", name: "Wisteria",      brand: "Nerolac",      collection: "Impression", hex: "#A880C0", pricePerL: 260 },
  { id: "f7", name: "Charcoal Slate",brand: "Asian Paints", collection: "Royale", hex: "#383838", pricePerL: 320 },
  { id: "f8", name: "Soot Black",    brand: "Asian Paints", collection: "Royale", hex: "#141414", pricePerL: 320 },
  { id: "f9", name: "Bridal Veil",   brand: "Nerolac",      collection: "Impression", hex: "#F8F2E8", pricePerL: 260 }
];

// Standard room estimate: ~40 sq metres (2 coats), ~10–12 sq m per litre
const ROOM_SQ_M = 40;
const COVERAGE_SQ_M_PER_L = 11;

const MAX_ZONES = 5;
const MAX_MASK_HISTORY = 20;

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
  isBrushing: false,
  compareSliderX: 0.5,
  brushCursor: null,
  mlModel: null,
  mlMask: null,
  mlLoading: false,
  mlReady: false,
  mlError: null
};

// Phase 2: local leads + draft persistence
const LEADS_STORAGE_KEY = "paintcrm_leads_v1";
const DRAFT_STORAGE_KEY = "paintcrm_draft_v1";
let leads = [];
let currentDetailLeadId = null;

async function loadShadeCatalog() {
  try {
    const res = await fetch("shades.json");
    if (!res.ok) throw new Error("fetch failed");
    SHADE_CATALOG = await res.json();
  } catch {
    SHADE_CATALOG = FALLBACK_SWATCHES;
  }
}

function findShadeInCatalog(hex) {
  const h = (hex || "").toLowerCase();
  return SHADE_CATALOG.find((s) => s.hex.toLowerCase() === h) || null;
}

function catalogEntry(shade) {
  // shade may already be a full catalog entry or a minimal {name, hex} from old data
  return findShadeInCatalog(shade.hex) || shade;
}

function updateCostEstimate(shade) {
  if (!shade || !costEstimateEl) return;
  const entry = catalogEntry(shade);
  if (!entry.pricePerL) {
    costEstimateEl.classList.add("hidden");
    return;
  }
  const litres = Math.ceil((ROOM_SQ_M * 2) / COVERAGE_SQ_M_PER_L); // 2 coats
  const total = litres * entry.pricePerL;
  costLitresEl.textContent = `~${litres}L for a standard room (2 coats)`;
  costTotalEl.textContent = `Est. ₹${total.toLocaleString("en-IN")} @ ₹${entry.pricePerL}/L`;
  costEstimateEl.classList.remove("hidden");
}

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

function setMlStatus(text, stateClass = "") {
  mlStatusEl.textContent = text;
  mlStatusEl.classList.remove("ok", "warn", "error");
  if (stateClass) mlStatusEl.classList.add(stateClass);
}

async function ensureMlModel() {
  if (state.mlModel) return state.mlModel;
  if (state.mlLoading) return null;
  if (!window.deeplab) {
    state.mlError = "deeplab_unavailable";
    setMlStatus("ML: unavailable (offline)", "warn");
    return null;
  }

  state.mlLoading = true;
  setMlStatus("ML: loading model...", "warn");
  try {
    state.mlModel = await window.deeplab.load({ base: "ade20k", quantizationBytes: 2 });
    state.mlReady = true;
    state.mlError = null;
    mlAssistToggle.disabled = !state.originalImage;
    setMlStatus("ML: ready", "ok");
    return state.mlModel;
  } catch (error) {
    console.error("Failed to load ML model", error);
    state.mlError = "model_load_failed";
    state.mlReady = false;
    mlAssistToggle.checked = false;
    mlAssistToggle.disabled = true;
    setMlStatus("ML: load failed (using smart mask)", "error");
    return null;
  } finally {
    state.mlLoading = false;
  }
}

function isWallLikeLabel(label) {
  return /wall|building|house|skyscraper|ceiling/i.test(label);
}

function extractMaskFromSegmentation(segmentation, targetWidth, targetHeight) {
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

function dilateMask(mask, width, height, radius) {
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

function fuseMasksWithMl(heuristicMask, mlMask, width, height) {
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

async function runMlSegmentationForCurrentImage() {
  if (!state.originalImage || !state.imageRect) return;
  if (!mlAssistToggle.checked) return;

  const model = await ensureMlModel();
  if (!model) return;

  setMlStatus("ML: analyzing walls...", "warn");
  try {
    const fit = state.imageRect;
    const maxSide = 640;
    const scale = Math.min(1, maxSide / Math.max(fit.drawWidth, fit.drawHeight));
    const sampleW = Math.max(64, Math.round(fit.drawWidth * scale));
    const sampleH = Math.max(64, Math.round(fit.drawHeight * scale));

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = sampleW;
    sampleCanvas.height = sampleH;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.drawImage(state.originalImage, 0, 0, sampleW, sampleH);

    const segmentation = await model.segment(sampleCanvas);
    state.mlMask = extractMaskFromSegmentation(segmentation, fit.drawWidth, fit.drawHeight);
    if (!state.mlMask) {
      setMlStatus("ML: no wall class found (fallback active)", "warn");
      return;
    }

    setMlStatus("ML: wall assist active", "ok");
    state.zones.forEach((z) => invalidateZoneAuto(z));
    drawPreview();
  } catch (error) {
    console.error("ML segmentation failed", error);
    state.mlMask = null;
    setMlStatus("ML: segmentation failed (fallback active)", "error");
  }
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

function rgbDistanceSquared(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function getPixelColor(pixels, x, y) {
  const idx = (y * pixels.width + x) * 4;
  return {
    r: pixels.data[idx],
    g: pixels.data[idx + 1],
    b: pixels.data[idx + 2]
  };
}

function findNearestCandidate(candidates, width, height, seedX, seedY, maxRadius = 28) {
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

function growRegionWithColorConstraint(pixels, candidates, width, height, seed, sensitivity) {
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
      b: Math.round(sumB / count)
    };

    const neighbors = [
      x > 0 ? cur - 1 : -1,
      x < width - 1 ? cur + 1 : -1,
      y > 0 ? cur - width : -1,
      y < height - 1 ? cur + width : -1
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
      [Math.floor(width * 0.66), Math.floor(height * 0.25)]
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

function createSeedMask(pixels, sensitivity, seed) {
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
    sensitivity
  );
  return smoothMask(mask, width, height);
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
  const catalog = SHADE_CATALOG.length ? SHADE_CATALOG : FALLBACK_SWATCHES;
  return catalog
    .map((s) => {
      const rgb = hexToRgb(s.hex);
      return {
        ...s,
        d: Math.sqrt((base.r - rgb.r) ** 2 + (base.g - rgb.g) ** 2 + (base.b - rgb.b) ** 2)
      };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
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
    manualEnabled: false,
    undoStack: [],
    redoStack: [],
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
  zone.manualEnabled = false;
  zone.undoStack = [];
  zone.redoStack = [];
  zone.autoMask = null;
  zone.autoSensitivity = null;
}

function pushMaskHistory(zone) {
  if (!zone.manualMask) return;
  zone.undoStack.push(new Uint8Array(zone.manualMask));
  if (zone.undoStack.length > MAX_MASK_HISTORY) zone.undoStack.shift();
  zone.redoStack.length = 0;
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
    contactBtn,
    beforeAfterToggle,
    compareToggle,
    mlAssistToggle,
    smartMaskToggle,
    naturalColorToggle,
    pickWallToggle,
    resetWallBtn,
    brushMaskToggle,
    brushEraseToggle,
    clearBrushBtn,
    undoMaskBtn,
    redoMaskBtn,
    addZoneBtn,
    removeZoneBtn,
    brushSizeSlider,
    opacitySlider,
    sensitivitySlider,
    edgeFeatherSlider
  ].forEach((el) => {
    el.disabled = !enabled;
  });
  // Leads inbox is always available (even with no current preview)
  if (leadsBtn) leadsBtn.disabled = false;
}

function toAlphaMask(binaryMask) {
  const alphaMask = new Uint8Array(binaryMask.length);
  for (let i = 0; i < binaryMask.length; i += 1) {
    alphaMask[i] = binaryMask[i] ? 255 : 0;
  }
  return alphaMask;
}

function createFeatheredAlphaMask(binaryMask, width, height, featherRadius) {
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

  const canUndo = Boolean(zone && zone.undoStack && zone.undoStack.length);
  const canRedo = Boolean(zone && zone.redoStack && zone.redoStack.length);
  undoMaskBtn.disabled = !state.originalImage || !canUndo;
  redoMaskBtn.disabled = !state.originalImage || !canRedo;

  if (!smartMaskToggle.checked) {
    maskStatusEl.textContent = `${name}: smart mask off`;
    maskStatusEl.classList.remove("locked");
    return;
  }

  if (brushMaskToggle.checked) {
    maskStatusEl.textContent = brushEraseToggle.checked
      ? `${name}: brush erase active`
      : `${name}: brush mode active`;
    maskStatusEl.classList.add("locked");
    return;
  }

  if (pickWallToggle.checked) {
    maskStatusEl.textContent = `${name}: tap inside image`;
    maskStatusEl.classList.remove("locked");
    return;
  }

  if (zone && zone.manualEnabled) {
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

  const entry = catalogEntry(shade);
  activeSwatchEl.style.background = shade.hex;
  activeShadeNameEl.textContent = entry.name || shade.name;
  activeShadeHexEl.textContent = shade.hex;
  if (activeShadeBrandEl) {
    activeShadeBrandEl.textContent = entry.brand
      ? `${entry.brand} — ${entry.collection || ""}`
      : "";
  }
  updateCostEstimate(entry);
  renderSwatches(suggestionsEl, state.shades, setActiveShade, shade.hex);
  drawPreview();
  saveDraft();
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

  const entry = catalogEntry(shade);
  activeSwatchEl.style.background = shade.hex;
  activeShadeNameEl.textContent = entry.name || shade.name;
  activeShadeHexEl.textContent = shade.hex;
  if (activeShadeBrandEl) {
    activeShadeBrandEl.textContent = entry.brand ? `${entry.brand} — ${entry.collection || ""}` : "";
  }
  updateCostEstimate(entry);

  renderZoneTabs();
  renderSwatches(suggestionsEl, state.shades, setActiveShade, shade.hex);
  updateMaskStatus();
  drawPreview();
  saveDraft();
}

function getZoneMask(zone, pixels, sensitivity) {
  ensureZoneBuffers(zone, pixels);

  if (zone.manualEnabled) return zone.manualMask;
  if (zone.autoMask && zone.autoSensitivity === sensitivity) return zone.autoMask;

  const baseMask = zone.seed
    ? createSeedMask(pixels, sensitivity, zone.seed)
    : createAutoMask(pixels, sensitivity);

  const mlAligned = state.mlMask && state.mlMask.length === pixels.width * pixels.height
    ? state.mlMask
    : null;

  zone.autoMask = (mlAssistToggle.checked && mlAligned)
    ? fuseMasksWithMl(baseMask, mlAligned, pixels.width, pixels.height)
    : baseMask;

  zone.autoSensitivity = sensitivity;
  return zone.autoMask;
}

function adoptCurrentMaskForManualEditing(zone, pixels, sensitivity) {
  ensureZoneBuffers(zone, pixels);
  if (zone.manualEnabled) return;

  const baseMask = getZoneMask(zone, pixels, sensitivity);
  zone.manualMask.set(baseMask);
  zone.manualEnabled = true;
  zone.seed = null;
  invalidateZoneAuto(zone);
}

function applyTint(data, width, height, alphaMask, shadeRgb, opacity, useNatural) {
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
        clamp(src.l * 0.9 + target.l * 0.1, 0, 1)
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

function renderTinted(pixels, compareHex = null) {
  const opacity = Number(opacitySlider.value);
  const sensitivity = Number(sensitivitySlider.value);
  const featherRadius = Number(edgeFeatherSlider.value);
  const useNatural = naturalColorToggle.checked;
  const data = new Uint8ClampedArray(pixels.data);

  if (!smartMaskToggle.checked) {
    const mask = new Uint8Array(pixels.width * pixels.height);
    for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
      if (isLikelyWallPixel(data[i], data[i + 1], data[i + 2], sensitivity)) {
        mask[p] = 1;
      }
    }
    applyTint(
      data,
      pixels.width,
      pixels.height,
      createFeatheredAlphaMask(mask, pixels.width, pixels.height, featherRadius),
      hexToRgb(compareHex || state.activeShade.hex),
      opacity,
      useNatural
    );
    return new ImageData(data, pixels.width, pixels.height);
  }

  const occupied = new Uint8Array(pixels.width * pixels.height);
  const zonesByPriority = [...state.zones].sort((a, b) => {
    const aPriority = a.id === state.activeZoneId ? 1 : 0;
    const bPriority = b.id === state.activeZoneId ? 1 : 0;
    return bPriority - aPriority;
  });

  for (const zone of zonesByPriority) {
    const zoneMask = getZoneMask(zone, pixels, sensitivity);
    const uniqueMask = new Uint8Array(zoneMask.length);

    for (let i = 0; i < zoneMask.length; i += 1) {
      if (zoneMask[i] && !occupied[i]) {
        uniqueMask[i] = 1;
        occupied[i] = 1;
      }
    }

    const shadeHex = zone.id === state.activeZoneId && compareHex ? compareHex : zone.shadeHex;
    applyTint(
      data,
      pixels.width,
      pixels.height,
      createFeatheredAlphaMask(uniqueMask, pixels.width, pixels.height, featherRadius),
      hexToRgb(shadeHex),
      opacity,
      useNatural
    );
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

function applyCompareSlider() {
  const pct = (state.compareSliderX * 100).toFixed(1);
  compareCanvas.style.clipPath = `inset(0 0 0 ${pct}%)`;
  compareHandle.style.left = `${pct}%`;
}

function drawCompareIfEnabled() {
  if (!compareToggle.checked || !state.compareShade || !state.originalImage || !state.imageRect) {
    compareCanvas.classList.add("hidden");
    compareHandle.classList.add("hidden");
    return;
  }

  compareCanvas.classList.remove("hidden");
  compareHandle.classList.remove("hidden");
  applyCompareSlider();

  const fit = state.imageRect;
  compareCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
  compareCtx.drawImage(state.originalImage, fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);

  const pixels = state.originalPixels || compareCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  compareCtx.putImageData(renderTinted(pixels, state.compareShade.hex), fit.dx, fit.dy);
}

function drawBrushCursor(x, y) {
  brushCursorCtx.clearRect(0, 0, brushCursorCanvas.width, brushCursorCanvas.height);
  const radius = Number(brushSizeSlider.value);
  const isErase = brushEraseToggle.checked;

  brushCursorCtx.beginPath();
  brushCursorCtx.arc(x, y, radius, 0, Math.PI * 2);

  if (isErase) {
    brushCursorCtx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    brushCursorCtx.lineWidth = 1.5;
    brushCursorCtx.setLineDash([5, 4]);
    brushCursorCtx.stroke();
    brushCursorCtx.setLineDash([]);
    brushCursorCtx.beginPath();
    brushCursorCtx.arc(x, y, radius, 0, Math.PI * 2);
    brushCursorCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    brushCursorCtx.lineWidth = 1;
    brushCursorCtx.stroke();
  } else {
    brushCursorCtx.fillStyle = "rgba(183, 66, 31, 0.18)";
    brushCursorCtx.fill();
    brushCursorCtx.strokeStyle = "rgba(183, 66, 31, 0.75)";
    brushCursorCtx.lineWidth = 1.5;
    brushCursorCtx.stroke();
  }

  brushCursorCtx.beginPath();
  brushCursorCtx.arc(x, y, 2, 0, Math.PI * 2);
  brushCursorCtx.fillStyle = isErase ? "rgba(0,0,0,0.5)" : "rgba(183, 66, 31, 0.85)";
  brushCursorCtx.fill();
}

function clearBrushCursor() {
  state.brushCursor = null;
  brushCursorCtx.clearRect(0, 0, brushCursorCanvas.width, brushCursorCanvas.height);
}

function onCursorMove(event) {
  if (!brushMaskToggle.checked) return;
  const rect = previewCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (previewCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (previewCanvas.height / rect.height);
  state.brushCursor = { x, y };
  drawBrushCursor(x, y);
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
  zone.manualEnabled = false;
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
  const brushValue = brushEraseToggle.checked ? 0 : 1;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = point.x + dx;
      const ny = point.y + dy;
      if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
      zone.manualMask[ny * zone.width + nx] = brushValue;
    }
  }

  zone.manualEnabled = true;
  zone.seed = null;
  invalidateZoneAuto(zone);
}

function onBrushDown(event) {
  if (!brushMaskToggle.checked) return;
  const pt = getLocalPoint(event);
  if (!pt) return;
  const zone = getActiveZone();
  if (zone) {
    adoptCurrentMaskForManualEditing(zone, state.originalPixels, Number(sensitivitySlider.value));
    ensureZoneBuffers(zone, state.originalPixels);
    pushMaskHistory(zone);
  }
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
  pushMaskHistory(zone);
  zone.manualMask.fill(0);
  zone.manualEnabled = false;
  zone.seed = null;
  invalidateZoneAuto(zone);
  updateMaskStatus();
  drawPreview();
}

function undoBrushMask() {
  const zone = getActiveZone();
  if (!zone || !zone.undoStack.length) return;

  zone.redoStack.push(new Uint8Array(zone.manualMask));
  zone.manualMask = zone.undoStack.pop();
  zone.manualEnabled = true;
  zone.seed = null;
  invalidateZoneAuto(zone);
  updateMaskStatus();
  drawPreview();
}

function redoBrushMask() {
  const zone = getActiveZone();
  if (!zone || !zone.redoStack.length) return;

  zone.undoStack.push(new Uint8Array(zone.manualMask));
  zone.manualMask = zone.redoStack.pop();
  zone.manualEnabled = true;
  zone.seed = null;
  invalidateZoneAuto(zone);
  updateMaskStatus();
  drawPreview();
}

function resetWallSelection() {
  const zone = getActiveZone();
  if (!zone) return;

  zone.seed = null;
  if (zone.manualMask) zone.manualMask.fill(0);
  zone.manualEnabled = false;
  zone.undoStack.length = 0;
  zone.redoStack.length = 0;
  invalidateZoneAuto(zone);

  pickWallToggle.checked = false;
  brushMaskToggle.checked = false;
  brushEraseToggle.checked = false;
  canvasWrap.classList.remove("picking", "brushing");
  updateMaskStatus();
  drawPreview();
}

function addWallTab() {
  if (state.zones.length >= MAX_ZONES) return;
  const zone = createZone(`Wall ${state.zones.length + 1}`, state.activeShade.hex);
  state.zones.push(zone);
  setActiveZone(zone.id);
  saveDraft();
}

function removeActiveWallTab() {
  if (state.zones.length <= 1) return;
  const idx = state.zones.findIndex((z) => z.id === state.activeZoneId);
  if (idx === -1) return;
  state.zones.splice(idx, 1);
  setActiveZone(state.zones[Math.max(0, idx - 1)].id);
  saveDraft();
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
  state.mlMask = null;

  renderSwatches(suggestionsEl, state.shades, setActiveShade, state.activeShade.hex);
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, state.compareShade.hex);
  renderZoneTabs();

  activeSwatchEl.style.background = state.activeShade.hex;
  activeShadeNameEl.textContent = state.activeShade.name;
  activeShadeHexEl.textContent = state.activeShade.hex;

  setControlsEnabled(true);
  if (!window.deeplab) {
    mlAssistToggle.checked = false;
    mlAssistToggle.disabled = true;
    setMlStatus("ML: unavailable (offline)", "warn");
  } else {
    mlAssistToggle.disabled = false;
    setMlStatus("ML: preparing...", "warn");
  }

  updateMaskStatus();
  canvasHint.classList.add("hidden");
  drawPreview();
  ensureMlModel().then(() => runMlSegmentationForCurrentImage());
  saveDraft();
}

function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.originalImage = img;
      initializeShadesFromImage();
      updateRestoreDraftUI();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function exportPreview() {
  if (!state.originalImage) return;
  const dataUrl = previewCanvas.toDataURL("image/png");

  if (navigator.canShare) {
    try {
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], `paint-preview-${Date.now()}.png`, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Paint Preview" });
        return;
      }
    } catch {
      // fall through to download
    }
  }

  const link = document.createElement("a");
  link.download = `paint-preview-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
}

/* ===================== Phase 2: Conversion Layer ===================== */

function loadLeads() {
  try {
    const raw = localStorage.getItem(LEADS_STORAGE_KEY);
    leads = raw ? JSON.parse(raw) : [];
  } catch {
    leads = [];
  }
  updateLeadsCount();
}

function saveLeads() {
  safeLsSet(LEADS_STORAGE_KEY, JSON.stringify(leads));
  updateLeadsCount();
}

function updateLeadsCount() {
  if (leadsCountEl) leadsCountEl.textContent = String(leads.length);
}

function getShadeNameForHex(hex) {
  const catalog = findShadeInCatalog(hex);
  if (catalog) return catalog.name;
  const found = state.shades.find((s) => s.hex.toLowerCase() === (hex || "").toLowerCase());
  return found ? found.name : "Custom";
}

function getShadeMetaForHex(hex) {
  const catalog = findShadeInCatalog(hex);
  if (catalog) return { name: catalog.name, brand: catalog.brand, collection: catalog.collection, hex };
  const found = state.shades.find((s) => s.hex.toLowerCase() === (hex || "").toLowerCase());
  return found ? { name: found.name, brand: found.brand || "", collection: "", hex } : { name: "Custom", brand: "", collection: "", hex };
}

function runShadeSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    shadeSearchResults.innerHTML = "";
    shadeSearchResults.classList.add("hidden");
    return;
  }
  const catalog = SHADE_CATALOG.length ? SHADE_CATALOG : FALLBACK_SWATCHES;
  const results = catalog.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    (s.brand || "").toLowerCase().includes(q) ||
    (s.collection || "").toLowerCase().includes(q) ||
    s.hex.toLowerCase().includes(q)
  ).slice(0, 12);

  shadeSearchResults.innerHTML = "";
  if (!results.length) {
    shadeSearchResults.classList.add("hidden");
    return;
  }
  results.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "swatch";
    if (s.hex === state.activeShade?.hex) btn.classList.add("active");
    btn.style.background = s.hex;
    btn.title = `${s.name} · ${s.brand} · ${s.hex}`;
    btn.addEventListener("click", () => {
      setActiveShade(s);
      // also add to suggestions for quick re-access
      if (!state.shades.find((x) => x.hex === s.hex)) {
        state.shades.unshift(s);
        state.shades = state.shades.slice(0, 6);
      }
      renderSwatches(suggestionsEl, state.shades, setActiveShade, s.hex);
    });
    shadeSearchResults.appendChild(btn);
  });
  shadeSearchResults.classList.remove("hidden");
}

function openContactModal() {
  if (!state.originalImage || !state.zones.length) return;
  // populate shades summary
  leadShadesSummary.innerHTML = "";
  state.zones.forEach((zone) => {
    const meta = getShadeMetaForHex(zone.shadeHex);
    const row = document.createElement("span");
    row.className = "lead-shade";
    const brandStr = meta.brand ? ` · ${meta.brand}` : "";
    row.innerHTML = `<span class="sw" style="background:${zone.shadeHex}"></span><span>${zone.label} — ${meta.name}${brandStr} <span class="muted">${zone.shadeHex}</span></span>`;
    leadShadesSummary.appendChild(row);
  });

  // snapshot current preview canvas (what user sees now) into the modal canvas
  const snapCtx = leadSnapshotCanvas.getContext("2d", { willReadFrequently: true });
  snapCtx.clearRect(0, 0, leadSnapshotCanvas.width, leadSnapshotCanvas.height);
  // fit previewCanvas into the snapshot canvas preserving aspect
  const srcW = previewCanvas.width;
  const srcH = previewCanvas.height;
  const dstW = leadSnapshotCanvas.width;
  const dstH = leadSnapshotCanvas.height;
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let dw, dh, dx, dy;
  if (srcRatio > dstRatio) {
    dw = dstW;
    dh = dstW / srcRatio;
    dx = 0;
    dy = (dstH - dh) / 2;
  } else {
    dh = dstH;
    dw = dstH * srcRatio;
    dx = (dstW - dw) / 2;
    dy = 0;
  }
  snapCtx.drawImage(previewCanvas, dx, dy, dw, dh);

  // reset form fields (keep previous name/phone for speed in demo flow)
  // but clear notes at least
  if (!leadNameInput.value) leadNameInput.value = "";
  if (!leadPhoneInput.value) leadPhoneInput.value = "";
  leadEmailInput.value = "";
  leadNotesInput.value = "";

  contactModal.classList.remove("hidden");
  // focus first field
  setTimeout(() => leadNameInput.focus(), 0);
}

function closeContactModal() {
  contactModal.classList.add("hidden");
}

function captureLeadFromForm(e) {
  e.preventDefault();
  if (!state.originalImage) return;

  const name = (leadNameInput.value || "").trim();
  const phone = (leadPhoneInput.value || "").trim();
  if (!name || !phone) return;

  // build shades payload from current zones (with full catalog metadata)
  const shades = state.zones.map((z) => {
    const meta = getShadeMetaForHex(z.shadeHex);
    return { wall: z.label, hex: z.shadeHex, name: meta.name, brand: meta.brand, collection: meta.collection };
  });

  // snapshot from the modal canvas (already rendered)
  const snapDataUrl = leadSnapshotCanvas.toDataURL("image/png");

  const lead = {
    id: "lead_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    name,
    phone,
    email: (leadEmailInput.value || "").trim(),
    notes: (leadNotesInput.value || "").trim(),
    shades,
    snapshot: snapDataUrl
  };

  leads.unshift(lead); // newest first
  saveLeads();
  closeContactModal();

  // friendly confirmation (non-blocking)
  showTransientToast(`Lead saved for ${name}. View in Leads inbox.`);
}

function showTransientToast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 16px;border-radius:999px;font-size:0.9rem;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:2000;";
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity 160ms ease";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 160);
  }, 1600);
}

function openLeadsModal() {
  renderLeadsList();
  leadsModal.classList.remove("hidden");
}

function closeLeadsModal() {
  leadsModal.classList.add("hidden");
}

function renderLeadsList() {
  leadsListEl.innerHTML = "";
  if (!leads.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "12px";
    empty.textContent = "No leads captured yet. Use Contact Dealer after a preview to save a customer decision.";
    leadsListEl.appendChild(empty);
    return;
  }

  leads.forEach((lead) => {
    const card = document.createElement("div");
    card.className = "lead-card";
    const when = new Date(lead.ts).toLocaleString();
    const count = lead.shades ? lead.shades.length : 0;

    card.innerHTML = `
      <img class="thumb" src="${lead.snapshot}" alt="preview for ${lead.name}" />
      <div class="meta">
        <div class="name">${lead.name}</div>
        <div class="phone">${lead.phone}</div>
        <div class="when">${when}</div>
      </div>
      <div class="summary">
        <span class="count">${count} wall${count === 1 ? "" : "s"}</span>
        <span>View →</span>
      </div>
    `;

    card.addEventListener("click", () => {
      closeLeadsModal();
      openLeadDetail(lead.id);
    });

    leadsListEl.appendChild(card);
  });
}

function openLeadDetail(leadId) {
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return;
  currentDetailLeadId = leadId;

  const when = new Date(lead.ts).toLocaleString();
  let html = `
    <div class="info">
      <div class="info-row"><span class="label">Name</span><strong>${lead.name}</strong></div>
      <div class="info-row"><span class="label">Phone</span><strong>${lead.phone}</strong></div>
      ${lead.email ? `<div class="info-row"><span class="label">Email</span>${lead.email}</div>` : ""}
      <div class="info-row"><span class="label">Captured</span>${when}</div>
      ${lead.notes ? `<div class="info-row"><span class="label">Notes</span><span>${lead.notes}</span></div>` : ""}
    </div>
    <div class="snapshot">
      <img src="${lead.snapshot}" alt="saved preview for ${lead.name}" />
    </div>
    <div>
      <h4 style="margin:4px 0 8px;font-size:0.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">Chosen shades</h4>
      <div class="walls">
  `;

  (lead.shades || []).forEach((s) => {
    const brandLine = s.brand ? `<span class="muted"> · ${s.brand}</span>` : "";
    html += `
      <div class="wall-row">
        <span class="sw" style="background:${s.hex}"></span>
        <span class="wall-label">${s.wall} — ${s.name}${brandLine} <span class="muted">${s.hex}</span></span>
      </div>
    `;
  });

  html += `</div></div>`;
  leadDetailBody.innerHTML = html;

  leadDetailModal.classList.remove("hidden");
}

function closeLeadDetail() {
  leadDetailModal.classList.add("hidden");
  currentDetailLeadId = null;
}

function deleteCurrentLead() {
  if (!currentDetailLeadId) return;
  leads = leads.filter((l) => l.id !== currentDetailLeadId);
  saveLeads();
  closeLeadDetail();
  // if leads modal was the caller path, re-open it to refresh list
  // for simplicity just show a toast; user can re-open inbox
  showTransientToast("Lead deleted.");
}

function exportCurrentLeadPackage() {
  if (!currentDetailLeadId) return;
  const lead = leads.find((l) => l.id === currentDetailLeadId);
  if (!lead) return;

  // 1) download the snapshot png
  const a = document.createElement("a");
  a.href = lead.snapshot;
  a.download = `lead-${lead.name.replace(/\s+/g, "-").toLowerCase()}-${new Date(lead.ts).toISOString().slice(0,10)}.png`;
  a.click();

  // 2) download a json sidecar
  const meta = {
    id: lead.id,
    capturedAt: new Date(lead.ts).toISOString(),
    customer: { name: lead.name, phone: lead.phone, email: lead.email || null, notes: lead.notes || null },
    shades: lead.shades
  };
  const blob = new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const b = document.createElement("a");
  b.href = url;
  b.download = `lead-${lead.name.replace(/\s+/g, "-").toLowerCase()}-${new Date(lead.ts).toISOString().slice(0,10)}.json`;
  b.click();
  URL.revokeObjectURL(url);
}

function clearAllLeads() {
  if (!leads.length) return;
  if (!confirm("Clear all locally stored leads? This cannot be undone.")) return;
  leads = [];
  saveLeads();
  renderLeadsList();
}

/* ---- Basic session draft save/restore (Phase 2) ---- */

function downscaleForDraft(img, maxWidth = 960) {
  const ratio = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.82); // smaller than png for storage
}

function safeLsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Storage full — try to free space by removing the draft and retry once
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* nothing */ }
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
}

function saveDraft() {
  if (!state.originalImage || !state.zones.length) return;
  try {
    const payload = {
      image: downscaleForDraft(state.originalImage),
      zones: state.zones.map((z) => ({ label: z.label, shadeHex: z.shadeHex })),
      savedAt: Date.now()
    };
    safeLsSet(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore — private mode or storage unavailable
  }
}

function hasDraft() {
  return !!localStorage.getItem(DRAFT_STORAGE_KEY);
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return false;
  let payload;
  try { payload = JSON.parse(raw); } catch { return false; }
  if (!payload.image || !payload.zones || !payload.zones.length) return false;

  const img = new Image();
  img.onload = () => {
    state.originalImage = img;
    // init shades + default single zone from dominant (will be overwritten)
    initializeShadesFromImage();

    // override with saved zone choices (preserve order/labels)
    // map saved hexes onto existing zones (or recreate)
    const saved = payload.zones;
    // first ensure we have enough zones
    while (state.zones.length < saved.length && state.zones.length < MAX_ZONES) {
      addWallTab();
    }
    saved.forEach((sv, i) => {
      if (state.zones[i]) {
        state.zones[i].label = sv.label || state.zones[i].label;
        state.zones[i].shadeHex = sv.shadeHex;
        // clear any prior manual/auto for a clean restore (user can re-brush)
        state.zones[i].seed = null;
        state.zones[i].manualEnabled = false;
        if (state.zones[i].manualMask) state.zones[i].manualMask.fill(0);
        invalidateZoneAuto(state.zones[i]);
      }
    });
    // set first as active and pick a matching shade object if possible
    setActiveZone(state.zones[0].id);
    // refresh tabs and swatches
    renderZoneTabs();
    drawPreview();
    showTransientToast("Restored previous draft session.");
    updateRestoreDraftUI();
    saveDraft(); // refresh timestamp
  };
  img.src = payload.image;
  return true;
}

function updateRestoreDraftUI() {
  if (restoreDraftBtn) {
    restoreDraftBtn.style.display = (!state.originalImage && hasDraft()) ? "" : "none";
  }
  if (clearSessionBtn) {
    clearSessionBtn.style.display = state.originalImage ? "" : "none";
  }
}

function clearSession() {
  state.originalImage = null;
  state.originalPixels = null;
  state.imageRect = null;
  state.shades = [];
  state.activeShade = null;
  state.compareShade = null;
  state.zones = [];
  state.activeZoneId = null;
  state.nextZoneId = 1;
  state.isBrushing = false;
  state.compareSliderX = 0.5;
  state.brushCursor = null;
  state.mlMask = null;

  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* nothing */ }

  // Reset canvas
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  compareCtx.clearRect(0, 0, compareCanvas.width, compareCanvas.height);
  brushCursorCtx.clearRect(0, 0, brushCursorCanvas.width, brushCursorCanvas.height);
  compareCanvas.classList.add("hidden");
  compareHandle.classList.add("hidden");
  brushCursorCanvas.classList.add("hidden");
  canvasHint.classList.remove("hidden");

  // Reset UI
  setControlsEnabled(false);
  suggestionsEl.innerHTML = "";
  compareSuggestionsEl.innerHTML = "";
  zoneTabsEl.innerHTML = "";
  activeSwatchEl.style.background = "";
  activeShadeNameEl.textContent = "No shade selected";
  activeShadeHexEl.textContent = "-";
  if (activeShadeBrandEl) activeShadeBrandEl.textContent = "";
  if (costEstimateEl) costEstimateEl.classList.add("hidden");
  if (shadeSearchResults) { shadeSearchResults.innerHTML = ""; shadeSearchResults.classList.add("hidden"); }
  if (shadeSearchInput) shadeSearchInput.value = "";

  beforeAfterToggle.checked = false;
  compareToggle.checked = false;
  brushMaskToggle.checked = false;
  brushEraseToggle.checked = false;
  pickWallToggle.checked = false;
  canvasWrap.classList.remove("picking", "brushing");

  setMlStatus("ML: loading model...", "");
  updateMaskStatus();
  updateRestoreDraftUI();
}

/* ===================== End Phase 2 helpers ===================== */

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleImageUpload(file);
});

opacitySlider.addEventListener("input", drawPreview);
sensitivitySlider.addEventListener("input", () => {
  state.zones.forEach((z) => invalidateZoneAuto(z));
  drawPreview();
});
edgeFeatherSlider.addEventListener("input", drawPreview);
beforeAfterToggle.addEventListener("change", drawPreview);
compareToggle.addEventListener("change", drawCompareIfEnabled);
mlAssistToggle.addEventListener("change", () => {
  state.zones.forEach((z) => invalidateZoneAuto(z));
  if (!mlAssistToggle.checked) {
    setMlStatus(state.mlReady ? "ML: ready" : "ML: off", "warn");
    drawPreview();
    return;
  }

  if (state.mlMask) {
    setMlStatus("ML: wall assist active", "ok");
    drawPreview();
    return;
  }

  runMlSegmentationForCurrentImage().then(() => {
    state.zones.forEach((z) => invalidateZoneAuto(z));
    drawPreview();
  });
});
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
    brushCursorCanvas.classList.remove("hidden");
  } else {
    brushCursorCanvas.classList.add("hidden");
    clearBrushCursor();
  }
  canvasWrap.classList.toggle("brushing", brushMaskToggle.checked);
  updateMaskStatus();
});

brushEraseToggle.addEventListener("change", () => {
  if (state.brushCursor) drawBrushCursor(state.brushCursor.x, state.brushCursor.y);
  updateMaskStatus();
});

resetWallBtn.addEventListener("click", resetWallSelection);
clearBrushBtn.addEventListener("click", clearBrushMask);
undoMaskBtn.addEventListener("click", undoBrushMask);
redoMaskBtn.addEventListener("click", redoBrushMask);
addZoneBtn.addEventListener("click", addWallTab);
removeZoneBtn.addEventListener("click", removeActiveWallTab);

previewCanvas.addEventListener("click", handleCanvasPick);
previewCanvas.addEventListener("pointerdown", onBrushDown);
previewCanvas.addEventListener("pointermove", onBrushMove);
previewCanvas.addEventListener("pointermove", onCursorMove);
previewCanvas.addEventListener("pointerleave", clearBrushCursor);
window.addEventListener("pointerup", onBrushUp);
window.addEventListener("pointercancel", onBrushUp);

brushSizeSlider.addEventListener("input", () => {
  if (state.brushCursor) drawBrushCursor(state.brushCursor.x, state.brushCursor.y);
});

let isDraggingSlider = false;

compareHandle.addEventListener("pointerdown", (e) => {
  isDraggingSlider = true;
  compareHandle.setPointerCapture(e.pointerId);
  e.stopPropagation();
});

compareHandle.addEventListener("pointermove", (e) => {
  if (!isDraggingSlider) return;
  const rect = canvasWrap.getBoundingClientRect();
  state.compareSliderX = clamp((e.clientX - rect.left) / rect.width, 0.03, 0.97);
  applyCompareSlider();
  e.stopPropagation();
});

compareHandle.addEventListener("pointerup", () => { isDraggingSlider = false; });
compareHandle.addEventListener("pointercancel", () => { isDraggingSlider = false; });

exportBtn.addEventListener("click", exportPreview);

// Startup
loadShadeCatalog(); // non-blocking; catalog will be ready before any image is uploaded
loadLeads();
updateRestoreDraftUI();
if (leadsBtn) leadsBtn.disabled = false;

if (contactBtn) contactBtn.addEventListener("click", openContactModal);
if (leadsBtn) leadsBtn.addEventListener("click", openLeadsModal);
if (restoreDraftBtn) restoreDraftBtn.addEventListener("click", () => { loadDraft(); });
if (clearSessionBtn) clearSessionBtn.addEventListener("click", clearSession);

if (shadeSearchInput) {
  shadeSearchInput.addEventListener("input", () => runShadeSearch(shadeSearchInput.value));
  shadeSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      shadeSearchInput.value = "";
      runShadeSearch("");
    }
  });
}

if (closeContactBtn) closeContactBtn.addEventListener("click", closeContactModal);
if (cancelContactBtn) cancelContactBtn.addEventListener("click", closeContactModal);
if (contactForm) contactForm.addEventListener("submit", captureLeadFromForm);

if (closeLeadsBtn) closeLeadsBtn.addEventListener("click", closeLeadsModal);
if (closeLeads2Btn) closeLeads2Btn.addEventListener("click", closeLeadsModal);
if (clearAllLeadsBtn) clearAllLeadsBtn.addEventListener("click", clearAllLeads);

if (closeDetailBtn) closeDetailBtn.addEventListener("click", closeLeadDetail);
if (deleteLeadBtn) deleteLeadBtn.addEventListener("click", deleteCurrentLead);
if (exportLeadBtn) exportLeadBtn.addEventListener("click", exportCurrentLeadPackage);

// Backdrop click to close
[contactModal, leadsModal, leadDetailModal].forEach((m) => {
  if (!m) return;
  m.addEventListener("click", (e) => {
    if (e.target === m) {
      m.classList.add("hidden");
      if (m === leadDetailModal) currentDetailLeadId = null;
    }
  });
});

// Escape key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (leadDetailModal && !leadDetailModal.classList.contains("hidden")) {
      closeLeadDetail();
      return;
    }
    if (leadsModal && !leadsModal.classList.contains("hidden")) {
      closeLeadsModal();
      return;
    }
    if (contactModal && !contactModal.classList.contains("hidden")) {
      closeContactModal();
      return;
    }
  }
});
