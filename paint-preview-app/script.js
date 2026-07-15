import { escHtml, fmtMoney } from "./src/utils.js";
import {
  apiRequest,
  getApiToken,
  getRefreshToken,
  setSession,
  clearTokens,
  setUnauthorizedHandler,
} from "./src/api.js";
import { createPaginator, withPageParams } from "./src/pagination.js";
import {
  clamp,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbDistanceSquared,
  getPixelColor,
} from "./src/color.js";
import {
  isWallLikeLabel,
  smoothMask,
  dilateMask,
  extractMaskFromSegmentation,
  fuseMasksWithMl,
  isLikelyWallPixel,
  createCandidatesMap,
  findNearestCandidate,
  growRegionWithColorConstraint,
  growRegion,
  createAutoMask,
  createSeedMask,
  averageColorSample,
} from "./src/segmentation.js";
import {
  toAlphaMask,
  createFeatheredAlphaMask,
  applyTint,
} from "./src/tint.js";
import { estimatePaint } from "./src/cost.js";
import { generateLeadId, generateEventId } from "./src/ids.js";
import { buildSmartSuggestions, roomMoodSummary } from "./src/palette.js";
import { showTransientToast } from "./src/app/toast.js";
import { createOnboardingChecklist } from "./src/app/onboardingChecklist.js";
import { createLedgerView } from "./src/views/ledger.js";
import { createQuotesView } from "./src/views/quotes.js";
import { createInventoryView } from "./src/views/inventory.js";
import { createCustomersView } from "./src/views/customers.js";

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

// Phase 5 CRM elements
const customersBtn = document.getElementById("customersBtn");
const customersModal = document.getElementById("customersModal");
const customersListEl = document.getElementById("customersList");
const customersSignInPrompt = document.getElementById("customersSignInPrompt");
const customersPanel = document.getElementById("customersPanel");
const customerSearchInput = document.getElementById("customerSearchInput");
const newCustomerBtn = document.getElementById("newCustomerBtn");
const closeCustomersBtn = document.getElementById("closeCustomersBtn");
const closeCustomers2Btn = document.getElementById("closeCustomers2Btn");
const customerDetailModal = document.getElementById("customerDetailModal");
const customerDetailBody = document.getElementById("customerDetailBody");
const closeCustomerDetailBtn = document.getElementById("closeCustomerDetailBtn");
const closeCustomerDetail2Btn = document.getElementById("closeCustomerDetail2Btn");
const addSiteBtn = document.getElementById("addSiteBtn");
const newCustomerModal = document.getElementById("newCustomerModal");
const newCustomerForm = document.getElementById("newCustomerForm");
const closeNewCustomerBtn = document.getElementById("closeNewCustomerBtn");
const cancelNewCustomerBtn = document.getElementById("cancelNewCustomerBtn");
const leadCustomerField = document.getElementById("leadCustomerField");
const leadSiteField = document.getElementById("leadSiteField");
const leadCustomerSelect = document.getElementById("leadCustomerSelect");
const leadSiteSelect = document.getElementById("leadSiteSelect");
const deleteCustomerBtn = document.getElementById("deleteCustomerBtn");
const editCustomerBtn = document.getElementById("editCustomerBtn");
const newCustomerTitle = document.getElementById("newCustomerTitle");
const saveCustomerBtn = document.getElementById("saveCustomerBtn");
const siteModal = document.getElementById("siteModal");
const siteForm = document.getElementById("siteForm");
const closeSiteBtn = document.getElementById("closeSiteBtn");
const cancelSiteBtn = document.getElementById("cancelSiteBtn");

let customersView;

// Phase 6 commerce elements (Quotes & Orders)
const quotesBtn = document.getElementById("quotesBtn");
const quotesModal = document.getElementById("quotesModal");
const quotesSignInPrompt = document.getElementById("quotesSignInPrompt");
const quotesPanel = document.getElementById("quotesPanel");
const closeQuotesBtn = document.getElementById("closeQuotesBtn");
const closeQuotes2Btn = document.getElementById("closeQuotes2Btn");
const quotesTabBtn = document.getElementById("quotesTabBtn");
const ordersTabBtn = document.getElementById("ordersTabBtn");
const docStatusFilter = document.getElementById("docStatusFilter");
const newQuoteBtn = document.getElementById("newQuoteBtn");
const docList = document.getElementById("docList");
const quoteFormModal = document.getElementById("quoteFormModal");
const quoteForm = document.getElementById("quoteForm");
const quoteFormTitle = document.getElementById("quoteFormTitle");
const closeQuoteFormBtn = document.getElementById("closeQuoteFormBtn");
const cancelQuoteFormBtn = document.getElementById("cancelQuoteFormBtn");
const saveQuoteBtn = document.getElementById("saveQuoteBtn");
const quoteCustomerSelect = document.getElementById("quoteCustomerSelect");
const quoteSiteSelect = document.getElementById("quoteSiteSelect");
const quoteItemsList = document.getElementById("quoteItemsList");
const quoteShadePicker = document.getElementById("quoteShadePicker");
const addQuoteItemBtn = document.getElementById("addQuoteItemBtn");
const quoteDiscount = document.getElementById("quoteDiscount");
const quoteTaxRate = document.getElementById("quoteTaxRate");
const quoteNotes = document.getElementById("quoteNotes");
const quoteTotals = document.getElementById("quoteTotals");
const quoteFormError = document.getElementById("quoteFormError");
const docDetailModal = document.getElementById("docDetailModal");
const docDetailTitle = document.getElementById("docDetailTitle");
const docDetailBody = document.getElementById("docDetailBody");
const docDetailActions = document.getElementById("docDetailActions");
const closeDocDetailBtn = document.getElementById("closeDocDetailBtn");

// Phase 6 inventory elements
const inventoryBtn = document.getElementById("inventoryBtn");
const inventoryModal = document.getElementById("inventoryModal");
const inventorySignInPrompt = document.getElementById("inventorySignInPrompt");
const inventoryPanel = document.getElementById("inventoryPanel");
const inventorySummary = document.getElementById("inventorySummary");
const inventorySearchInput = document.getElementById("inventorySearchInput");
const inventoryStatusFilter = document.getElementById("inventoryStatusFilter");
const newInventoryBtn = document.getElementById("newInventoryBtn");
const inventoryList = document.getElementById("inventoryList");
const closeInventoryBtn = document.getElementById("closeInventoryBtn");
const closeInventory2Btn = document.getElementById("closeInventory2Btn");
const inventoryFormModal = document.getElementById("inventoryFormModal");
const inventoryForm = document.getElementById("inventoryForm");
const inventoryFormTitle = document.getElementById("inventoryFormTitle");
const closeInventoryFormBtn = document.getElementById("closeInventoryFormBtn");
const cancelInventoryFormBtn = document.getElementById("cancelInventoryFormBtn");
const saveInventoryBtn = document.getElementById("saveInventoryBtn");
const invShadePicker = document.getElementById("invShadePicker");
const invQtyField = document.getElementById("invQtyField");
const inventoryFormError = document.getElementById("inventoryFormError");
const inventoryDetailModal = document.getElementById("inventoryDetailModal");
const inventoryDetailTitle = document.getElementById("inventoryDetailTitle");
const inventoryDetailBody = document.getElementById("inventoryDetailBody");
const deleteInventoryBtn = document.getElementById("deleteInventoryBtn");
const editInventoryBtn = document.getElementById("editInventoryBtn");
const closeInventoryDetailBtn = document.getElementById("closeInventoryDetailBtn");
const closeInventoryDetail2Btn = document.getElementById("closeInventoryDetail2Btn");

// Phase 6 credit-ledger elements
const ledgerBtn = document.getElementById("ledgerBtn");
const ledgerModal = document.getElementById("ledgerModal");
const ledgerSignInPrompt = document.getElementById("ledgerSignInPrompt");
const ledgerPanel = document.getElementById("ledgerPanel");
const ledgerSummary = document.getElementById("ledgerSummary");
const ledgerSearchInput = document.getElementById("ledgerSearchInput");
const ledgerFilter = document.getElementById("ledgerFilter");
const ledgerList = document.getElementById("ledgerList");
const closeLedgerBtn = document.getElementById("closeLedgerBtn");
const closeLedger2Btn = document.getElementById("closeLedger2Btn");
const ledgerDetailModal = document.getElementById("ledgerDetailModal");
const ledgerDetailTitle = document.getElementById("ledgerDetailTitle");
const ledgerDetailBody = document.getElementById("ledgerDetailBody");
const closeLedgerDetailBtn = document.getElementById("closeLedgerDetailBtn");
const closeLedgerDetail2Btn = document.getElementById("closeLedgerDetail2Btn");

const ledgerView = createLedgerView({
  els: {
    ledgerBtn,
    ledgerModal,
    ledgerSignInPrompt,
    ledgerPanel,
    ledgerSummary,
    ledgerSearchInput,
    ledgerFilter,
    ledgerList,
    closeLedgerBtn,
    closeLedger2Btn,
    ledgerDetailModal,
    ledgerDetailTitle,
    ledgerDetailBody,
    closeLedgerDetailBtn,
    closeLedgerDetail2Btn,
  },
  apiRequest,
  getApiToken,
});

const canvasWrap = document.getElementById("canvasWrap");
const previewCanvas = document.getElementById("previewCanvas");
const compareCanvas = document.getElementById("compareCanvas");
const brushCursorCanvas = document.getElementById("brushCursorCanvas");
const compareHandle = document.getElementById("compareHandle");
const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
const compareCtx = compareCanvas.getContext("2d", { willReadFrequently: true });
const brushCursorCtx = brushCursorCanvas.getContext("2d");

const suggestionsEl = document.getElementById("suggestions");
const smartPaletteHintEl = document.getElementById("smartPaletteHint");
const aiPaletteRowEl = document.getElementById("aiPaletteRow");
const aiPalettePromptEl = document.getElementById("aiPalettePrompt");
const aiPaletteBtnEl = document.getElementById("aiPaletteBtn");
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
  dominantRgb: null,
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

// Phase 3: pilot analytics + dealer settings
const ANALYTICS_STORAGE_KEY = "paintcrm_analytics_v1";
const DEALER_STORAGE_KEY = "paintcrm_dealer_v1";

// Phase 4: backend API — token storage + apiRequest live in ./src/api.js.
// Guests who chose "continue without an account" get this flag so the auth
// gate lets them use the offline features without a session.
const GUEST_MODE_KEY = "paintcrm_guest_v1";
function isGuestMode() {
  try { return localStorage.getItem(GUEST_MODE_KEY) === "1"; } catch { return false; }
}
function exitGuestMode() {
  try { localStorage.removeItem(GUEST_MODE_KEY); } catch { /* nothing */ }
}

// Phase 5: CRM offline cache
let apiTenant = null; // { id, shopName, dealerName, phone, email }

let analyticsEvents = [];
let pilotSessionId = null;
let pilotSessionStart = null;
let pilotFirstShadeTs = null;
let pilotFirstActionTs = null;
let dealerSettings = { shopName: "", dealerName: "", phone: "" };

async function loadShadeCatalog() {
  if (getApiToken()) {
    const { data, error } = await apiRequest("GET", "/api/shades");
    if (!error && data?.shades?.length) {
      SHADE_CATALOG = data.shades;
      return;
    }
  }
  try {
    const res = await fetch("shades.json");
    if (!res.ok) throw new Error("fetch failed");
    SHADE_CATALOG = await res.json();
  } catch {
    SHADE_CATALOG = FALLBACK_SWATCHES;
  }
}

function getCurrentCostEstimate() {
  const zone = getActiveZone();
  if (!zone) return null;
  const entry = catalogEntry({ hex: zone.shadeHex });
  const est = estimatePaint({
    pricePerL: entry?.pricePerL,
    roomSqM: ROOM_SQ_M,
    coveragePerL: COVERAGE_SQ_M_PER_L,
  });
  if (!est) return null;
  return {
    ...est,
    shadeName: entry.name,
    brand: entry.brand || "",
  };
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
  const est = estimatePaint({
    pricePerL: entry.pricePerL,
    roomSqM: ROOM_SQ_M,
    coveragePerL: COVERAGE_SQ_M_PER_L,
  });
  if (!est) {
    costEstimateEl.classList.add("hidden");
    return;
  }
  costLitresEl.textContent = `~${est.litres}L for a standard room (${est.coats} coats)`;
  costTotalEl.textContent = `Est. ₹${est.totalInr.toLocaleString("en-IN")} @ ₹${est.pricePerL}/L`;
  costEstimateEl.classList.remove("hidden");
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

function renderSmartSuggestions(container, shades, onClick, activeHex) {
  container.innerHTML = "";
  shades.forEach((shade, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-card";
    if (shade.hex === activeHex) button.classList.add("active");

    const swatch = document.createElement("span");
    swatch.className = "suggestion-swatch";
    swatch.style.background = shade.hex;

    const meta = document.createElement("span");
    meta.className = "suggestion-meta";

    const name = document.createElement("span");
    name.className = "suggestion-name";
    name.textContent = shade.name;

    const brand = document.createElement("span");
    brand.className = "suggestion-brand muted tiny";
    brand.textContent = shade.brand || "";

    const cost = document.createElement("span");
    cost.className = "suggestion-cost tiny";
    if (shade.estimate?.totalInr) {
      cost.textContent = `~₹${shade.estimate.totalInr.toLocaleString("en-IN")} · ${shade.estimate.litres}L`;
    } else {
      cost.textContent = shade.hex;
    }

    const mood = document.createElement("span");
    mood.className = "suggestion-mood tiny muted";
    mood.textContent = shade.reason || shade.moodLabel || (index === 0 ? "Best match" : "");

    meta.append(name, brand, cost, mood);
    button.append(swatch, meta);
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
  renderSmartSuggestions(suggestionsEl, state.shades, setActiveShade, shade.hex);
  trackShadeSelected(entry); // Phase 3: track decision event
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
  renderSmartSuggestions(suggestionsEl, state.shades, setActiveShade, shade.hex);
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

function updateAiPaletteControls() {
  const hasPhoto = Boolean(state.dominantRgb);
  const signedIn = Boolean(getApiToken());

  if (aiPaletteRowEl) {
    aiPaletteRowEl.classList.toggle("hidden", !hasPhoto);
  }

  if (aiPaletteBtnEl) {
    // Guests get server heuristic ranking; signed-in dealers may get OpenAI when configured.
    aiPaletteBtnEl.disabled = !hasPhoto;
    aiPaletteBtnEl.title = signedIn
      ? "Refine picks (OpenAI when configured; otherwise smart heuristic)"
      : "Smart palette from your photo (sign in for optional OpenAI refinement)";
  }
}

async function fetchAiRecommendations() {
  if (!state.dominantRgb) return;

  const prompt = aiPalettePromptEl?.value?.trim() || "";
  if (aiPaletteBtnEl) {
    aiPaletteBtnEl.disabled = true;
    aiPaletteBtnEl.textContent = "Thinking…";
  }

  const { data, error } = await apiRequest("POST", "/api/ai/recommend-shades", {
    dominant: state.dominantRgb,
    prompt,
    limit: 6,
  });

  if (aiPaletteBtnEl) {
    aiPaletteBtnEl.textContent = "Smart picks";
    updateAiPaletteControls();
  }

  if (error || !data?.suggestions?.length) {
    showTransientToast(error || "Could not fetch palette picks — try again.");
    return;
  }

  state.shades = data.suggestions;
  if (smartPaletteHintEl && data.summary) {
    smartPaletteHintEl.textContent = data.summary;
  }

  state.activeShade = state.shades[0];
  state.compareShade = state.shades[1] || state.shades[0];
  const zone = getActiveZone();
  if (zone) zone.shadeHex = state.activeShade.hex;

  renderSmartSuggestions(suggestionsEl, state.shades, setActiveShade, state.activeShade.hex);
  renderSwatches(compareSuggestionsEl, state.shades, setCompareShade, state.compareShade.hex);
  activeSwatchEl.style.background = state.activeShade.hex;
  activeShadeNameEl.textContent = state.activeShade.name;
  activeShadeHexEl.textContent = state.activeShade.hex;
  updateCostEstimate(catalogEntry(state.activeShade));
  drawPreview();
  saveDraft();

  showTransientToast(
    data.source === "openai" ? "AI shade picks applied." : "Smart palette picks applied.",
  );
}

function initializeShadesFromImage() {
  const fit = drawImageFit(previewCtx, state.originalImage, previewCanvas);
  const pixels = previewCtx.getImageData(fit.dx, fit.dy, fit.drawWidth, fit.drawHeight);
  const dominant = averageColorSample(pixels);
  state.dominantRgb = dominant;

  const catalog = SHADE_CATALOG.length ? SHADE_CATALOG : FALLBACK_SWATCHES;
  state.shades = buildSmartSuggestions(dominant, catalog);
  if (smartPaletteHintEl) {
    smartPaletteHintEl.textContent = roomMoodSummary(state.shades[0]?.roomMoods || []);
  }
  updateAiPaletteControls();
  state.activeShade = state.shades[0];
  state.compareShade = state.shades[1] || state.shades[0];

  state.zones = [createZone("Wall 1", state.activeShade.hex)];
  state.activeZoneId = state.zones[0].id;
  state.mlMask = null;

  renderSmartSuggestions(suggestionsEl, state.shades, setActiveShade, state.activeShade.hex);
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
      startPilotSession(); // Phase 3: begin a new pilot session
      initializeShadesFromImage();
      onboardingChecklist?.complete("photo");
      updateRestoreDraftUI();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function exportPreview() {
  if (!state.originalImage) return;
  trackShareExport(); // Phase 3
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
  const tabCount = document.getElementById("leadsTabCount");
  if (tabCount) tabCount.textContent = leads.length ? ` (${leads.length})` : "";
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
  const raw = query.trim().toLowerCase();
  if (!raw) {
    shadeSearchResults.innerHTML = "";
    shadeSearchResults.classList.add("hidden");
    return;
  }
  // Split into tokens so "dulux teal" finds Dulux shades that contain "teal" anywhere
  const tokens = raw.split(/\s+/).filter(Boolean);
  const catalog = SHADE_CATALOG.length ? SHADE_CATALOG : FALLBACK_SWATCHES;
  const results = catalog.filter((s) => {
    const haystack = [s.name, s.brand || "", s.collection || "", s.hex, s.tags || ""].join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  }).slice(0, 12);

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
      renderSmartSuggestions(suggestionsEl, state.shades, setActiveShade, s.hex);
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
  trackContactOpened(); // Phase 3
  customersView.populateLeadCrmFields();
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

  const costEstimate = getCurrentCostEstimate();

  const lead = {
    id: generateLeadId(),
    ts: Date.now(),
    name,
    phone,
    email: (leadEmailInput.value || "").trim(),
    notes: (leadNotesInput.value || "").trim(),
    shades,
    snapshot: snapDataUrl,
    costEstimate: costEstimate || null,
    customerId: leadCustomerSelect?.value || null,
    siteId: leadSiteSelect?.value || null,
  };

  leads.unshift(lead); // newest first
  saveLeads();
  trackContactSaved(lead.id); // Phase 3
  syncLeadToServer(lead);     // Phase 4: best-effort server sync
  closeContactModal();

  onboardingChecklist?.complete("lead");
  showTransientToast(`Lead saved for ${name}. View in Leads inbox.`);
}

function openLeadsModal() {
  switchLeadsTab("leads"); // Phase 3: always open on leads tab
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

  if (getApiToken()) {
    html += `
      <div style="margin-top:14px;">
        <button type="button" id="viewCustomerFromLeadBtn" class="button ghost tiny">View customer profile →</button>
      </div>
    `;
  }

  leadDetailBody.innerHTML = html;

  const viewCustomerBtn = document.getElementById("viewCustomerFromLeadBtn");
  if (viewCustomerBtn) {
    viewCustomerBtn.addEventListener("click", () => customersView.openCustomerFromLead(lead));
  }

  leadDetailModal.classList.remove("hidden");
}

function closeLeadDetail() {
  leadDetailModal.classList.add("hidden");
  currentDetailLeadId = null;
}

function deleteCurrentLead() {
  if (!currentDetailLeadId) return;
  const deletedId = currentDetailLeadId;
  leads = leads.filter((l) => l.id !== deletedId);
  saveLeads();
  deleteLeadFromServer(deletedId); // Phase 4: best-effort server sync
  closeLeadDetail();
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
    dealer: { shopName: dealerSettings.shopName || null, dealerName: dealerSettings.dealerName || null, phone: dealerSettings.phone || null },
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

async function clearAllLeads() {
  if (!leads.length) return;
  if (!confirm("Clear all leads on this device? Synced server leads will also be deleted.")) return;
  const toDelete = [...leads];
  if (getApiToken()) {
    await Promise.all(toDelete.map((l) => deleteLeadFromServer(l.id)));
  }
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
  state.dominantRgb = null;
  if (aiPalettePromptEl) aiPalettePromptEl.value = "";
  updateAiPaletteControls();

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

/* ===================== Phase 4: Backend API Sync ===================== */

// Clears the server session locally (tokens live in ./src/api.js) and wipes
// any cached CRM data so nothing leaks across sign-ins.
function clearApiToken() {
  clearTokens();
  customersView?.clearCache();
  apiTenant = null;
}

// The app is gated behind sign-in, so send unauthenticated users to the login
// page (preserving where they were headed) instead of leaving them on a
// signed-out home screen.
function redirectToLogin() {
  const dest = location.pathname + location.search + location.hash;
  location.replace("/login?redirect=" + encodeURIComponent(dest));
}

// When a session can no longer be refreshed, reset state and return to login.
setUnauthorizedHandler(() => {
  apiTenant = null;
  customersView?.clearCache();
  if (typeof updateServerSyncUI === "function") updateServerSyncUI();
  redirectToLogin();
});

// Called at startup — tries to validate stored token + load tenant info
async function loadApiSession() {
  const token = getApiToken();
  if (!token) {
    // Guests explicitly opted into offline use; everyone else gets sent to login.
    if (!isGuestMode()) redirectToLogin();
    return;
  }
  const { data, error } = await apiRequest("GET", "/api/auth/me");
  if (error || !data?.tenant) {
    // A genuine 401 is already handled by the unauthorized handler in
    // ./src/api.js (tokens cleared + redirect to /login). Other failures
    // (offline / server error) are transient — keep the session so a brief
    // hiccup doesn't sign the user out.
    updateServerSyncUI();
    return;
  }
  apiTenant = data.tenant;
  updateServerSyncUI();
  await completeServerSessionRestore();
}

async function loginToServer(email, password) {
  const { data, error } = await apiRequest("POST", "/api/auth/login", { email, password });
  if (error) return { ok: false, error };
  setSession(data);
  exitGuestMode();
  apiTenant = data.tenant;
  updateServerSyncUI();
  await completeServerSessionRestore();
  return { ok: true };
}

async function registerOnServer(shopName, dealerName, phone, email, password) {
  const { data, error } = await apiRequest("POST", "/api/auth/register", { shopName, dealerName, phone, email, password });
  if (error) return { ok: false, error };
  setSession(data);
  exitGuestMode();
  apiTenant = data.tenant;
  updateServerSyncUI();
  await completeServerSessionRestore();
  return { ok: true };
}

async function completeServerSessionRestore() {
  await syncDealerFromServer();
  await syncLeadsFromServer();
  await loadShadeCatalog();
}

async function syncDealerFromServer() {
  if (!getApiToken()) return;
  const { data, error } = await apiRequest("GET", "/api/dealer");
  if (error || !data?.dealer) return;
  const d = data.dealer;
  saveDealerSettings({
    shopName: d.shopName || "",
    dealerName: d.dealerName || "",
    phone: d.phone || "",
  });
}

async function logoutFromServer() {
  // Best-effort server-side revocation of this session's refresh token.
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await apiRequest("POST", "/api/auth/logout", { refreshToken });
  }
  clearApiToken();
  updateServerSyncUI();
  showTransientToast("Signed out from server.");
  redirectToLogin();
}

// Sync a single lead to the server (fire-and-forget; local state is source of truth)
async function syncLeadToServer(lead) {
  if (!getApiToken()) return;
  await apiRequest("POST", "/api/leads", {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email || "",
    notes: lead.notes || "",
    shades: lead.shades || [],
    snapshotB64: lead.snapshot || "",
    costEstimate: lead.costEstimate || null,
    customerId: lead.customerId || null,
    siteId: lead.siteId || null,
    pilotSessionId: pilotSessionId || null,
    createdAt: new Date(lead.ts).toISOString(),
  });
}

// Delete a lead from the server
async function deleteLeadFromServer(leadId) {
  if (!getApiToken()) return;
  await apiRequest("DELETE", `/api/leads/${leadId}`);
}

async function fetchLeadSnapshotFromServer(leadId) {
  const { data, error } = await apiRequest("GET", `/api/leads/${leadId}`);
  if (error || !data?.lead) return "";
  return data.lead.snapshotB64 || "";
}

// Fetch server leads and merge with local (server wins on conflict by ts)
async function syncLeadsFromServer() {
  if (!getApiToken()) return;
  const { data, error } = await apiRequest("GET", "/api/leads");
  if (error || !data?.leads) return;

  const serverLeads = data.leads.map((l) => ({
    id: l.id,
    ts: new Date(l.createdAt).getTime(),
    name: l.name,
    phone: l.phone,
    email: l.email || "",
    notes: l.notes || "",
    shades: l.shades || [],
    costEstimate: l.costEstimate || null,
    customerId: l.customerId || null,
    siteId: l.siteId || null,
    snapshot: "",
  }));

  const localById = new Map(leads.map((l) => [l.id, l]));
  for (const sl of serverLeads) {
    const existing = localById.get(sl.id);
    if (!existing) {
      sl.snapshot = await fetchLeadSnapshotFromServer(sl.id);
      localById.set(sl.id, sl);
      continue;
    }
    if (!existing.snapshot) {
      existing.snapshot = await fetchLeadSnapshotFromServer(sl.id);
    }
    if (sl.ts > existing.ts) {
      existing.name = sl.name;
      existing.phone = sl.phone;
      existing.email = sl.email;
      existing.notes = sl.notes;
      existing.shades = sl.shades.length ? sl.shades : existing.shades;
      existing.costEstimate = sl.costEstimate || existing.costEstimate;
      existing.ts = sl.ts;
    }
    localById.set(sl.id, existing);
  }

  const serverIds = new Set(serverLeads.map((l) => l.id));
  for (const local of leads) {
    if (!serverIds.has(local.id)) syncLeadToServer(local);
  }

  leads = [...localById.values()].sort((a, b) => b.ts - a.ts);
  saveLeads();
  updateLeadsCount();
}

// Send a single analytics event to the server (best-effort, non-blocking)
async function syncEventToServer(evt) {
  if (!getApiToken() && !pilotSessionId) return;
  const payload = { ...evt.data };
  await apiRequest("POST", "/api/events", {
    sessionId: evt.sessionId,
    eventType: evt.type,
    payload,
  }).catch(() => { /* ignore network errors */ });
}

// Update dealer profile on server after saving settings
async function apiUpdateDealer(settings) {
  if (!getApiToken()) return;
  await apiRequest("PUT", "/api/dealer", {
    shopName: settings.shopName || "My Shop",
    dealerName: settings.dealerName || "",
    phone: settings.phone || "",
  });
}

// Update the Settings modal server-sync section UI
function updateServerSyncUI() {
  const statusEl = document.getElementById("serverSyncStatus");
  const loginSection = document.getElementById("serverLoginSection");
  const loggedInSection = document.getElementById("serverLoggedInSection");
  const tenantNameEl = document.getElementById("serverTenantName");

  if (!statusEl) return;

  if (apiTenant) {
    statusEl.textContent = "Connected";
    statusEl.className = "sync-status connected";
    if (loginSection) loginSection.classList.add("hidden");
    if (loggedInSection) loggedInSection.classList.remove("hidden");
    if (tenantNameEl) tenantNameEl.textContent = `${apiTenant.shopName} (${apiTenant.email})`;
  } else {
    statusEl.textContent = "Not connected";
    statusEl.className = "sync-status";
    if (loginSection) loginSection.classList.remove("hidden");
    if (loggedInSection) loggedInSection.classList.add("hidden");
  }

  updateAiPaletteControls();
}

// Handle the login / register form in Settings modal
async function handleServerAuthSubmit(mode) {
  const emailEl = document.getElementById("serverEmail");
  const passEl = document.getElementById("serverPassword");
  const shopEl = document.getElementById("serverShopName");
  const errEl = document.getElementById("serverAuthError");
  const btn = document.getElementById("serverAuthBtn");

  const email = (emailEl?.value || "").trim();
  const password = passEl?.value || "";
  const shopName = (shopEl?.value || "").trim();

  if (!email || !password) { if (errEl) errEl.textContent = "Email and password required."; return; }
  if (mode === "register" && !shopName) { if (errEl) errEl.textContent = "Shop name required."; return; }

  if (btn) { btn.disabled = true; btn.textContent = mode === "login" ? "Signing in…" : "Registering…"; }
  if (errEl) errEl.textContent = "";

  let result;
  if (mode === "login") {
    result = await loginToServer(email, password);
  } else {
    result = await registerOnServer(shopName, dealerSettings.dealerName || "", dealerSettings.phone || "", email, password);
  }

  if (btn) { btn.disabled = false; btn.textContent = mode === "login" ? "Sign In" : "Register"; }

  if (!result.ok) {
    if (errEl) errEl.textContent = result.error || "Authentication failed.";
    return;
  }

  showTransientToast(mode === "login" ? "Signed in — leads will sync to server." : "Account created! Leads will now sync.");
  closeSettingsModal();
}

/* ===================== Phase 5: CRM Lite ===================== */

async function syncPreviewSessionToServer(sessionType, extra = {}) {
  if (!getApiToken() || !pilotSessionId) return;
  await apiRequest("POST", "/api/sessions", {
    pilotSessionId,
    sessionType,
    summary: extra.summary || "",
    shades: extra.shades || [],
    name: dealerSettings.dealerName || "",
    phone: dealerSettings.phone || "",
  }).catch(() => { /* best-effort */ });
}

customersView = createCustomersView({
  els: {
    customersBtn,
    customersModal,
    customersListEl,
    customersSignInPrompt,
    customersPanel,
    customerSearchInput,
    newCustomerBtn,
    closeCustomersBtn,
    closeCustomers2Btn,
    customerDetailModal,
    customerDetailBody,
    closeCustomerDetailBtn,
    closeCustomerDetail2Btn,
    addSiteBtn,
    newCustomerModal,
    newCustomerForm,
    closeNewCustomerBtn,
    cancelNewCustomerBtn,
    deleteCustomerBtn,
    editCustomerBtn,
    newCustomerTitle,
    saveCustomerBtn,
    siteModal,
    siteForm,
    closeSiteBtn,
    cancelSiteBtn,
    leadCustomerField,
    leadSiteField,
    leadCustomerSelect,
    leadSiteSelect,
  },
  apiRequest,
  getApiToken,
  safeLsSet,
  closeLeadDetail,
});

const quotesView = createQuotesView({
  els: {
    quotesBtn,
    quotesModal,
    quotesSignInPrompt,
    quotesPanel,
    closeQuotesBtn,
    closeQuotes2Btn,
    quotesTabBtn,
    ordersTabBtn,
    docStatusFilter,
    newQuoteBtn,
    docList,
    quoteFormModal,
    quoteForm,
    quoteFormTitle,
    closeQuoteFormBtn,
    cancelQuoteFormBtn,
    saveQuoteBtn,
    quoteCustomerSelect,
    quoteSiteSelect,
    quoteItemsList,
    quoteShadePicker,
    addQuoteItemBtn,
    quoteDiscount,
    quoteTaxRate,
    quoteNotes,
    quoteTotals,
    quoteFormError,
    docDetailModal,
    docDetailTitle,
    docDetailBody,
    docDetailActions,
    closeDocDetailBtn,
  },
  apiRequest,
  getApiToken,
  fetchCustomers: customersView.fetchCustomers,
  getCatalog: () => SHADE_CATALOG,
  roomSqM: ROOM_SQ_M,
  coverageSqMPerL: COVERAGE_SQ_M_PER_L,
  onQuoteCreated: () => onboardingChecklist?.complete("quote"),
});

let onboardingChecklist = createOnboardingChecklist({
  rootEl: document.getElementById("onboardingChecklist"),
  getApiToken,
  onOpenQuotes: () => quotesView.openQuotesModal(),
  onOpenContact: () => openContactModal(),
});

const inventoryView = createInventoryView({
  els: {
    inventoryBtn,
    inventoryModal,
    inventorySignInPrompt,
    inventoryPanel,
    inventorySummary,
    inventorySearchInput,
    inventoryStatusFilter,
    newInventoryBtn,
    inventoryList,
    closeInventoryBtn,
    closeInventory2Btn,
    inventoryFormModal,
    inventoryForm,
    inventoryFormTitle,
    closeInventoryFormBtn,
    cancelInventoryFormBtn,
    saveInventoryBtn,
    invShadePicker,
    invQtyField,
    inventoryFormError,
    inventoryDetailModal,
    inventoryDetailTitle,
    inventoryDetailBody,
    deleteInventoryBtn,
    editInventoryBtn,
    closeInventoryDetailBtn,
    closeInventoryDetail2Btn,
  },
  apiRequest,
  getApiToken,
  getCatalog: () => SHADE_CATALOG,
});

/* ===================== Phase 3: Pilot Validation Analytics ===================== */

function loadAnalytics() {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    analyticsEvents = raw ? JSON.parse(raw) : [];
  } catch {
    analyticsEvents = [];
  }
}

function saveAnalytics() {
  if (analyticsEvents.length > 600) analyticsEvents = analyticsEvents.slice(-600);
  safeLsSet(ANALYTICS_STORAGE_KEY, JSON.stringify(analyticsEvents));
}

function trackEvent(type, data = {}) {
  const evt = { id: generateEventId(), ts: Date.now(), type, sessionId: pilotSessionId || null, data };
  analyticsEvents.push(evt);
  saveAnalytics();
  syncEventToServer(evt); // Phase 4: best-effort server sync
}

function startPilotSession() {
  pilotSessionId = generateEventId();
  pilotSessionStart = Date.now();
  pilotFirstShadeTs = null;
  pilotFirstActionTs = null;
  trackEvent("session_start", { dealer: dealerSettings.shopName || "" });
  syncPreviewSessionToServer("session_start", { summary: "Preview session started" });
}

function trackShadeSelected(shade) {
  if (!pilotSessionId) return;
  const isFirst = !pilotFirstShadeTs;
  if (!pilotFirstShadeTs) pilotFirstShadeTs = Date.now();
  const ttFirstShade = isFirst ? pilotFirstShadeTs - (pilotSessionStart || pilotFirstShadeTs) : null;
  trackEvent("shade_selected", { hex: shade.hex, name: shade.name, brand: shade.brand || "", ttFirstShade });
  syncPreviewSessionToServer("shade_selected", {
    summary: `Selected ${shade.name}`,
    shades: [{ hex: shade.hex, name: shade.name, brand: shade.brand || "" }],
  });
}

function trackShareExport() {
  if (!pilotSessionId) return;
  const isFirst = !pilotFirstActionTs;
  if (!pilotFirstActionTs) pilotFirstActionTs = Date.now();
  const ttAction = isFirst ? pilotFirstActionTs - (pilotSessionStart || pilotFirstActionTs) : null;
  trackEvent("share_exported", { ttAction });
}

function trackContactOpened() {
  if (!pilotSessionId) return;
  trackEvent("contact_opened", {});
}

function trackContactSaved(leadId) {
  if (!pilotSessionId) return;
  const isFirst = !pilotFirstActionTs;
  if (!pilotFirstActionTs) pilotFirstActionTs = Date.now();
  const ttAction = isFirst ? pilotFirstActionTs - (pilotSessionStart || pilotFirstActionTs) : null;
  trackEvent("contact_saved", { leadId, ttAction });
}

function buildAnalyticsHtml(metrics) {
  const {
    totalSessions,
    avgShadeSec,
    contactCount,
    contactRate,
    shareCount,
    shareRate,
    days,
    maxDay,
    sourceNote,
  } = metrics;

  const emptyMsg = totalSessions === 0
    ? `<p class="analytics-empty">No pilot sessions yet.<br>Analytics start when a customer uploads their first room photo.</p>`
    : "";

  return `
    <div class="analytics-grid">
      <div class="analytics-card">
        <div class="a-label">Sessions (30d)</div>
        <div class="a-value">${totalSessions}</div>
        <div class="a-sub">unique preview sessions</div>
      </div>
      <div class="analytics-card">
        <div class="a-label">Avg. decision time</div>
        <div class="a-value">${avgShadeSec > 0 ? avgShadeSec + "s" : "—"}</div>
        <div class="a-sub">to first shade pick</div>
      </div>
      <div class="analytics-card">
        <div class="a-label">Contact rate</div>
        <div class="a-value">${totalSessions ? contactRate + "%" : "—"}</div>
        <div class="a-sub">${contactCount} of ${totalSessions} sessions</div>
      </div>
      <div class="analytics-card">
        <div class="a-label">Share rate</div>
        <div class="a-value">${totalSessions ? shareRate + "%" : "—"}</div>
        <div class="a-sub">${shareCount} of ${totalSessions} sessions</div>
      </div>
    </div>
    <div class="analytics-bars">
      <h4>Sessions — last 7 days</h4>
      ${days.map((d) => `
        <div class="bar-row">
          <span class="day-label" style="${d.isToday ? "color:var(--accent);font-weight:600" : ""}">${d.label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((d.count / maxDay) * 100)}%"></div></div>
          <span class="bar-count">${d.count || ""}</span>
        </div>
      `).join("")}
    </div>
    ${emptyMsg}
    <p class="muted tiny" style="margin-top:12px;">${sourceNote}</p>
  `;
}

function buildLast7DayBars(startEvents) {
  const now = Date.now();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dayEnd = d.getTime() + 86400000;
    const count = startEvents.filter((e) => e.ts >= d.getTime() && e.ts < dayEnd).length;
    days.push({ label: dayNames[d.getDay()], count, isToday: i === 0 });
  }
  return { days, maxDay: Math.max(1, ...days.map((d) => d.count)) };
}

function buildAnalyticsHtmlFromLocal() {
  const now = Date.now();
  const MS_30D = 30 * 24 * 60 * 60 * 1000;
  const recent = analyticsEvents.filter((e) => now - e.ts < MS_30D);

  const startEvents = recent.filter((e) => e.type === "session_start");
  const totalSessions = startEvents.length;

  const firstShadeEvents = recent.filter((e) => e.type === "shade_selected" && e.data.ttFirstShade != null);
  const avgShadeMs = firstShadeEvents.length
    ? firstShadeEvents.reduce((s, e) => s + e.data.ttFirstShade, 0) / firstShadeEvents.length
    : 0;
  const avgShadeSec = Math.round(avgShadeMs / 1000);

  const contactSessionIds = new Set(recent.filter((e) => e.type === "contact_saved").map((e) => e.sessionId));
  const contactCount = contactSessionIds.size;
  const contactRate = totalSessions ? Math.round((contactCount / totalSessions) * 100) : 0;

  const shareSessionIds = new Set(recent.filter((e) => e.type === "share_exported").map((e) => e.sessionId));
  const shareCount = shareSessionIds.size;
  const shareRate = totalSessions ? Math.round((shareCount / totalSessions) * 100) : 0;

  const { days, maxDay } = buildLast7DayBars(startEvents);

  return buildAnalyticsHtml({
    totalSessions,
    avgShadeSec,
    contactCount,
    contactRate,
    shareCount,
    shareRate,
    days,
    maxDay,
    sourceNote: "Data is stored locally on this device. Sign in to see combined metrics from all devices.",
  });
}

function buildAnalyticsHtmlFromServer(summary) {
  const totalSessions = summary.sessions || 0;
  const avgShadeSec = summary.avgDecisionMs ? Math.round(summary.avgDecisionMs / 1000) : 0;
  const contactCount = summary.contacts || 0;
  const contactRate = summary.contactRate || 0;
  const shareCount = summary.shares || 0;
  const shareRate = summary.shareRate || 0;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyMap = new Map();
  for (const row of summary.daily || []) {
    const key = String(row.day).slice(0, 10);
    dailyMap.set(key, parseInt(row.sessions, 10) || 0);
  }

  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: dayNames[d.getDay()], count: dailyMap.get(key) || 0, isToday: i === 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return buildAnalyticsHtml({
    totalSessions,
    avgShadeSec,
    contactCount,
    contactRate,
    shareCount,
    shareRate,
    days,
    maxDay,
    sourceNote: "Data from server — combined across all signed-in devices.",
  });
}

async function renderAnalytics() {
  const panel = document.getElementById("analyticsPanel");
  if (!panel) return;

  if (getApiToken()) {
    panel.innerHTML = `<p class="muted tiny">Loading analytics…</p>`;
    const { data, error } = await apiRequest("GET", "/api/events/summary");
    if (!error && data) {
      panel.innerHTML = buildAnalyticsHtmlFromServer(data);
      return;
    }
  }

  panel.innerHTML = buildAnalyticsHtmlFromLocal();
}

function exportAnalyticsJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    dealer: dealerSettings,
    totalEvents: analyticsEvents.length,
    events: analyticsEvents
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paintcrm-pilot-analytics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAnalyticsData() {
  if (!confirm("Clear all pilot analytics data? This cannot be undone.")) return;
  analyticsEvents = [];
  try { localStorage.removeItem(ANALYTICS_STORAGE_KEY); } catch { /* nothing */ }
  showTransientToast("Analytics data cleared.");
}

/* ---- Dealer Settings (Phase 3) ---- */

function loadDealerSettings() {
  try {
    const raw = localStorage.getItem(DEALER_STORAGE_KEY);
    dealerSettings = raw ? JSON.parse(raw) : { shopName: "", dealerName: "", phone: "" };
  } catch {
    dealerSettings = { shopName: "", dealerName: "", phone: "" };
  }
  applyDealerBranding();
}

function saveDealerSettings(settings) {
  dealerSettings = settings;
  safeLsSet(DEALER_STORAGE_KEY, JSON.stringify(settings));
  applyDealerBranding();
}

function applyDealerBranding() {
  const el = document.getElementById("dealerBranding");
  if (!el) return;
  const parts = [dealerSettings.shopName, dealerSettings.dealerName].filter(Boolean);
  if (parts.length) {
    el.textContent = "\uD83D\uDCCD " + parts.join(" \u00B7 ");
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function openSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;
  const shopInput = document.getElementById("settingShopName");
  const dealerInput = document.getElementById("settingDealerName");
  const phoneInput = document.getElementById("settingDealerPhone");
  if (shopInput) shopInput.value = dealerSettings.shopName || "";
  if (dealerInput) dealerInput.value = dealerSettings.dealerName || "";
  if (phoneInput) phoneInput.value = dealerSettings.phone || "";
  updateServerSyncUI(); // Phase 4: refresh connection status
  modal.classList.remove("hidden");
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.add("hidden");
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  const shopName = (document.getElementById("settingShopName")?.value || "").trim();
  const dealerName = (document.getElementById("settingDealerName")?.value || "").trim();
  const phone = (document.getElementById("settingDealerPhone")?.value || "").trim();
  saveDealerSettings({ shopName, dealerName, phone });
  apiUpdateDealer({ shopName, dealerName, phone }); // Phase 4: sync to server
  closeSettingsModal();
  showTransientToast("Settings saved.");
}

/* ---- Leads modal tab switching (Phase 3) ---- */

function switchLeadsTab(tab) {
  const leadsPanel = document.getElementById("leadsList");
  const analyticsPanel = document.getElementById("analyticsPanel");
  const leadsTabBtn = document.getElementById("leadsTabBtn");
  const analyticsTabBtn = document.getElementById("analyticsTabBtn");
  const actionsRow = document.getElementById("leadsModalActions");

  if (tab === "analytics") {
    if (leadsPanel) leadsPanel.classList.add("hidden");
    if (analyticsPanel) { analyticsPanel.classList.remove("hidden"); renderAnalytics(); }
    if (leadsTabBtn) leadsTabBtn.classList.remove("active");
    if (analyticsTabBtn) analyticsTabBtn.classList.add("active");
    if (actionsRow) actionsRow.style.display = "none";
  } else {
    if (leadsPanel) leadsPanel.classList.remove("hidden");
    if (analyticsPanel) analyticsPanel.classList.add("hidden");
    if (leadsTabBtn) leadsTabBtn.classList.add("active");
    if (analyticsTabBtn) analyticsTabBtn.classList.remove("active");
    if (actionsRow) actionsRow.style.display = "";
  }
}

/* ===================== End Phase 3 helpers ===================== */

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
loadAnalytics();       // Phase 3
loadDealerSettings();  // Phase 3
loadApiSession();      // Phase 4: validate stored token, sync leads from server
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

if (aiPaletteBtnEl) {
  aiPaletteBtnEl.addEventListener("click", () => { fetchAiRecommendations(); });
}
if (aiPalettePromptEl) {
  aiPalettePromptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !aiPaletteBtnEl?.disabled) {
      e.preventDefault();
      fetchAiRecommendations();
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

// Phase 5: CRM
customersView.wireListeners();

// Phase 6: Quotes, Inventory, Ledger
quotesView.wireListeners();
inventoryView.wireListeners();
ledgerView.wireListeners();
onboardingChecklist?.render();

// Phase 3: leads modal tab buttons
const leadsTabBtn = document.getElementById("leadsTabBtn");
const analyticsTabBtn = document.getElementById("analyticsTabBtn");
if (leadsTabBtn) leadsTabBtn.addEventListener("click", () => switchLeadsTab("leads"));
if (analyticsTabBtn) analyticsTabBtn.addEventListener("click", () => switchLeadsTab("analytics"));

// Phase 3: settings modal
const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtnEl = document.getElementById("closeSettingsBtn");
const cancelSettingsBtnEl = document.getElementById("cancelSettingsBtn");
const settingsFormEl = document.getElementById("settingsForm");
const settingsModal = document.getElementById("settingsModal");
const exportAnalyticsBtnEl = document.getElementById("exportAnalyticsBtn");
const clearAnalyticsBtnEl = document.getElementById("clearAnalyticsBtn");

if (settingsBtn) settingsBtn.addEventListener("click", openSettingsModal);
if (closeSettingsBtnEl) closeSettingsBtnEl.addEventListener("click", closeSettingsModal);
if (cancelSettingsBtnEl) cancelSettingsBtnEl.addEventListener("click", closeSettingsModal);
if (settingsFormEl) settingsFormEl.addEventListener("submit", handleSettingsSubmit);
if (exportAnalyticsBtnEl) exportAnalyticsBtnEl.addEventListener("click", exportAnalyticsJson);
if (clearAnalyticsBtnEl) clearAnalyticsBtnEl.addEventListener("click", clearAnalyticsData);

// Phase 4: server sync UI wiring
(function wireServerSyncUI() {
  const loginTabBtn     = document.getElementById("authTabLogin");
  const registerTabBtn  = document.getElementById("authTabRegister");
  const registerFields  = document.getElementById("registerOnlyFields");
  const authBtn         = document.getElementById("serverAuthBtn");
  const logoutBtn       = document.getElementById("serverLogoutBtn");
  let authMode = "login";

  if (loginTabBtn) loginTabBtn.addEventListener("click", () => {
    authMode = "login";
    loginTabBtn.classList.add("active");
    if (registerTabBtn) registerTabBtn.classList.remove("active");
    if (registerFields) registerFields.classList.add("hidden");
    if (authBtn) authBtn.textContent = "Sign In";
    const passEl = document.getElementById("serverPassword");
    if (passEl) passEl.setAttribute("autocomplete", "current-password");
  });

  if (registerTabBtn) registerTabBtn.addEventListener("click", () => {
    authMode = "register";
    registerTabBtn.classList.add("active");
    if (loginTabBtn) loginTabBtn.classList.remove("active");
    if (registerFields) registerFields.classList.remove("hidden");
    if (authBtn) authBtn.textContent = "Register";
    const passEl = document.getElementById("serverPassword");
    if (passEl) passEl.setAttribute("autocomplete", "new-password");
  });

  if (authBtn) authBtn.addEventListener("click", () => handleServerAuthSubmit(authMode));
  if (logoutBtn) logoutBtn.addEventListener("click", logoutFromServer);
})();

// Backdrop click to close
[contactModal, leadsModal, leadDetailModal, settingsModal, quotesModal, docDetailModal, inventoryModal, inventoryDetailModal, ledgerModal, ledgerDetailModal].forEach((m) => {
  if (!m) return;
  m.addEventListener("click", (e) => {
    if (e.target === m) {
      m.classList.add("hidden");
      if (m === leadDetailModal) currentDetailLeadId = null;
      if (m === docDetailModal) quotesView.clearCurrentDoc();
      if (m === inventoryDetailModal) inventoryView.clearCurrentInventory();
      if (m === ledgerDetailModal) ledgerView.clearCurrentLedgerCustomer();
    }
  });
});

// Escape key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (ledgerDetailModal && !ledgerDetailModal.classList.contains("hidden")) {
      ledgerView.closeLedgerDetail();
      return;
    }
    if (ledgerModal && !ledgerModal.classList.contains("hidden")) {
      ledgerView.closeLedgerModal();
      return;
    }
    if (inventoryDetailModal && !inventoryDetailModal.classList.contains("hidden")) {
      inventoryView.closeInventoryDetail();
      return;
    }
    if (inventoryFormModal && !inventoryFormModal.classList.contains("hidden")) {
      inventoryView.closeInventoryForm();
      return;
    }
    if (inventoryModal && !inventoryModal.classList.contains("hidden")) {
      inventoryView.closeInventoryModal();
      return;
    }
    if (docDetailModal && !docDetailModal.classList.contains("hidden")) {
      quotesView.closeDocDetail();
      return;
    }
    if (quoteFormModal && !quoteFormModal.classList.contains("hidden")) {
      quotesView.closeQuoteForm();
      return;
    }
    if (quotesModal && !quotesModal.classList.contains("hidden")) {
      quotesView.closeQuotesModal();
      return;
    }
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
    if (settingsModal && !settingsModal.classList.contains("hidden")) {
      closeSettingsModal();
      return;
    }
  }
});
