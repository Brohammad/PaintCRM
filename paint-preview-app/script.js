const imageInput = document.getElementById("imageInput");
const exportBtn = document.getElementById("exportBtn");
const beforeAfterToggle = document.getElementById("beforeAfterToggle");
const compareToggle = document.getElementById("compareToggle");
const smartMaskToggle = document.getElementById("smartMaskToggle");
const opacitySlider = document.getElementById("opacitySlider");
const sensitivitySlider = document.getElementById("sensitivitySlider");

const previewCanvas = document.getElementById("previewCanvas");
const compareCanvas = document.getElementById("compareCanvas");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const compareCtx = compareCanvas.getContext("2d", { willReadFrequently: true });

const suggestionsEl = document.getElementById("suggestions");
const compareSuggestionsEl = document.getElementById("compareSuggestions");
const activeSwatchEl = document.getElementById("activeSwatch");
const activeShadeNameEl = document.getElementById("activeShadeName");
const activeShadeHexEl = document.getElementById("activeShadeHex");
const canvasHint = document.getElementById("canvasHint");

const BASE_SWATCHES = [
  { name: "Calm Ivory", hex: "#E8DFCF" },
  { name: "Warm Sand", hex: "#D7BFA0" },
  { name: "Clay Blush", hex: "#C9987B" },
  { name: "Olive Dust", hex: "#A9A57C" },
  { name: "Misty Blue", hex: "#9AAFC2" },
  { name: "Graphite Calm", hex: "#6F747C" },
  { name: "Terracotta Sun", hex: "#BD6A45" },
  { name: "Forest Chalk", hex: "#768B78" }
];

const state = {
  originalImage: null,
  activeShade: null,
  compareShade: null,
  shades: [],
  originalPixels: null,
  imageRect: null,
  wallMask: null,
  maskSensitivity: null
};

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

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPerceivedBrightness(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
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
  const brightness = getPerceivedBrightness(r, g, b);

  const satThreshold = clamp(sensitivity / 100, 0.1, 0.6);
  const brightnessLow = 45;
  const brightnessHigh = 235;

  return sat < satThreshold && brightness > brightnessLow && brightness < brightnessHigh;
}

function createSoftwareWallMask(pixels, sensitivity) {
  const { width, height, data } = pixels;
  const size = width * height;
  const candidates = new Uint8Array(size);
  const mask = new Uint8Array(size);

  for (let i = 0, px = 0; i < size; i += 1, px += 4) {
    const r = data[px];
    const g = data[px + 1];
    const b = data[px + 2];
    if (isLikelyWallPixel(r, g, b, sensitivity)) {
      candidates[i] = 1;
    }
  }

  const seeds = [
    [Math.floor(width * 0.5), Math.floor(height * 0.2)],
    [Math.floor(width * 0.33), Math.floor(height * 0.25)],
    [Math.floor(width * 0.66), Math.floor(height * 0.25)],
    [Math.floor(width * 0.5), Math.floor(height * 0.35)]
  ];

  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  function trySeed(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (!candidates[idx] || mask[idx]) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  }

  for (const [sx, sy] of seeds) {
    if (tail > size - 5) break;
    trySeed(sx, sy);
  }

  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = (current - x) / width;

    if (x > 0) {
      const left = current - 1;
      if (candidates[left] && !mask[left]) {
        mask[left] = 1;
        queue[tail++] = left;
      }
    }

    if (x < width - 1) {
      const right = current + 1;
      if (candidates[right] && !mask[right]) {
        mask[right] = 1;
        queue[tail++] = right;
      }
    }

    if (y > 0) {
      const up = current - width;
      if (candidates[up] && !mask[up]) {
        mask[up] = 1;
        queue[tail++] = up;
      }
    }

    if (y < height - 1) {
      const down = current + width;
      if (candidates[down] && !mask[down]) {
        mask[down] = 1;
        queue[tail++] = down;
      }
    }
  }

  return mask;
}

function tintPixels(pixels, shadeRgb, opacity, sensitivity, wallMask) {
  const data = new Uint8ClampedArray(pixels.data);
  const blend = opacity / 100;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (wallMask) {
      if (!wallMask[p]) continue;
    } else if (!isLikelyWallPixel(r, g, b, sensitivity)) {
      continue;
    }

    data[i] = Math.round(r * (1 - blend) + shadeRgb.r * blend);
    data[i + 1] = Math.round(g * (1 - blend) + shadeRgb.g * blend);
    data[i + 2] = Math.round(b * (1 - blend) + shadeRgb.b * blend);
  }

  return new ImageData(data, pixels.width, pixels.height);
}

function averageColorSample(pixels) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const step = 24;
  for (let y = 0; y < pixels.height; y += step) {
    for (let x = 0; x < pixels.width; x += step) {
      const idx = (y * pixels.width + x) * 4;
      r += pixels.data[idx];
      g += pixels.data[idx + 1];
      b += pixels.data[idx + 2];
      count += 1;
    }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  };
}

function colorDistance(a, b) {
  return Math.sqrt(
    (a.r - b.r) ** 2 +
      (a.g - b.g) ** 2 +
      (a.b - b.b) ** 2
  );
}

function buildSuggestions(baseColor) {
  const ranked = BASE_SWATCHES
    .map((shade) => {
      const rgb = hexToRgb(shade.hex);
      return {
        ...shade,
        distance: colorDistance(baseColor, rgb)
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return ranked.slice(0, 5);
}

function setControlsEnabled(enabled) {
  exportBtn.disabled = !enabled;
  beforeAfterToggle.disabled = !enabled;
  compareToggle.disabled = !enabled;
  smartMaskToggle.disabled = !enabled;
  opacitySlider.disabled = !enabled;
  sensitivitySlider.disabled = !enabled;
}

function ensureWallMask(pixels, sensitivity) {
  if (!smartMaskToggle.checked) return null;
  if (
    state.wallMask &&
    state.maskSensitivity === sensitivity &&
    state.wallMask.length === pixels.width * pixels.height
  ) {
    return state.wallMask;
  }

  state.wallMask = createSoftwareWallMask(pixels, sensitivity);
  state.maskSensitivity = sensitivity;
  return state.wallMask;
}

function renderSwatches(container, shades, onClick, activeHex) {
  container.innerHTML = "";
  shades.forEach((shade) => {
    const swatch = document.createElement("button");
    swatch.className = "swatch";
    swatch.title = `${shade.name} ${shade.hex}`;
    swatch.style.background = shade.hex;
    if (shade.hex === activeHex) swatch.classList.add("active");
    swatch.addEventListener("click", () => onClick(shade));
    container.appendChild(swatch);
  });
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
    const opacity = Number(opacitySlider.value);
    const sensitivity = Number(sensitivitySlider.value);
    const wallMask = ensureWallMask(pixels, sensitivity);
    const tinted = tintPixels(
      pixels,
      hexToRgb(state.activeShade.hex),
      opacity,
      sensitivity,
      wallMask
    );
    previewCtx.putImageData(tinted, fit.dx, fit.dy);
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
  const opacity = Number(opacitySlider.value);
  const sensitivity = Number(sensitivitySlider.value);
  const wallMask = ensureWallMask(pixels, sensitivity);
  const tinted = tintPixels(
    pixels,
    hexToRgb(state.compareShade.hex),
    opacity,
    sensitivity,
    wallMask
  );
  compareCtx.putImageData(tinted, fit.dx, fit.dy);
}

function setActiveShade(shade) {
  state.activeShade = shade;
  activeSwatchEl.style.background = shade.hex;
  activeShadeNameEl.textContent = shade.name;
  activeShadeHexEl.textContent = shade.hex;

  renderSwatches(suggestionsEl, state.shades, setActiveShade, shade.hex);
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, state.compareShade?.hex);

  drawPreview();
}

function setCompareShade(shade) {
  state.compareShade = shade;
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, shade.hex);
  drawCompareIfEnabled();
}

function initializeShadesFromImage() {
  const fit = drawImageFit(previewCtx, state.originalImage, previewCanvas);
  const pixels = previewCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  const dominant = averageColorSample(pixels);

  state.shades = buildSuggestions(dominant);
  state.activeShade = state.shades[0];
  state.compareShade = state.shades[1] || state.shades[0];
  state.wallMask = null;
  state.maskSensitivity = null;

  renderSwatches(suggestionsEl, state.shades, setActiveShade, state.activeShade.hex);
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, state.compareShade.hex);

  setActiveShade(state.activeShade);
  setControlsEnabled(true);
  canvasHint.classList.add("hidden");
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

  if (navigator.share && navigator.canShare) {
    previewCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "paint-preview.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: "Paint Preview",
            text: `Preview shade: ${state.activeShade?.name ?? "selected"}`,
            files: [file]
          });
        } catch {
          // User canceled share action.
        }
      }
    });
  }
}

imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  handleImageUpload(file);
});

opacitySlider.addEventListener("input", drawPreview);
sensitivitySlider.addEventListener("input", () => {
  state.wallMask = null;
  state.maskSensitivity = null;
  drawPreview();
});
beforeAfterToggle.addEventListener("change", drawPreview);
compareToggle.addEventListener("change", drawCompareIfEnabled);
smartMaskToggle.addEventListener("change", () => {
  state.wallMask = null;
  state.maskSensitivity = null;
  drawPreview();
});
exportBtn.addEventListener("click", exportPreview);
