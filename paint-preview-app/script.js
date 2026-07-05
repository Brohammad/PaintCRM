import { escHtml, fmtMoney, round2 } from "./src/utils.js";
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
  buildSuggestions,
} from "./src/tint.js";
import { estimatePaint } from "./src/cost.js";
import { statusBadge, overdueDaysLabel, balanceSummaryLine } from "./src/format.js";
import { generateLeadId, generateEventId } from "./src/ids.js";

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

let crmCustomers = [];
let currentCustomerId = null;
let currentCustomerObj = null;
let editingCustomerId = null;

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

let commerceTab = "quotes";
let editingQuoteId = null;
let currentDoc = null;

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

let editingInventoryId = null;
let currentInventoryId = null;
let currentInventoryObj = null;

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

let currentLedgerCustomerId = null;

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
const CUSTOMERS_CACHE_KEY = "paintcrm_customers_cache_v1";
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

  state.shades = buildSuggestions(dominant, SHADE_CATALOG.length ? SHADE_CATALOG : FALLBACK_SWATCHES);
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
      startPilotSession(); // Phase 3: begin a new pilot session
      initializeShadesFromImage();
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
  trackContactOpened(); // Phase 3
  populateLeadCrmFields();
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
    viewCustomerBtn.addEventListener("click", () => openCustomerFromLead(lead));
  }

  leadDetailModal.classList.remove("hidden");
}

async function openCustomerFromLead(lead) {
  if (!getApiToken()) return;
  let customerId = lead.customerId;

  // Fallback: locally captured lead not yet linked — match by phone on the server
  if (!customerId && lead.phone) {
    const { data } = await apiRequest("GET", `/api/customers?q=${encodeURIComponent(lead.phone)}`);
    const match = (data?.customers || []).find((c) => c.phone === lead.phone);
    customerId = match?.id || null;
  }

  if (!customerId) {
    showTransientToast("No linked customer yet. Sync this lead first.");
    return;
  }

  closeLeadDetail();
  openCustomerDetail(customerId);
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
  try {
    localStorage.removeItem(CUSTOMERS_CACHE_KEY);
  } catch { /* nothing */ }
  apiTenant = null;
  crmCustomers = [];
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
  crmCustomers = [];
  try { localStorage.removeItem(CUSTOMERS_CACHE_KEY); } catch { /* nothing */ }
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

function saveCustomersCache(list) {
  try { safeLsSet(CUSTOMERS_CACHE_KEY, JSON.stringify(list || [])); } catch { /* storage full */ }
}

function loadCustomersCache() {
  try {
    const raw = localStorage.getItem(CUSTOMERS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function hasCustomersCache() {
  return loadCustomersCache().length > 0;
}

// Fetch customers from server; falls back to (and refreshes) the local cache.
async function fetchCustomers(q = "") {
  if (!getApiToken()) {
    const cached = loadCustomersCache();
    return filterCustomersLocally(cached, q);
  }
  const path = q ? `/api/customers?q=${encodeURIComponent(q)}` : "/api/customers";
  const { data, error } = await apiRequest("GET", path);
  if (error || !data?.customers) {
    // Offline / server error — serve from cache so CRM stays usable
    return filterCustomersLocally(loadCustomersCache(), q);
  }
  crmCustomers = data.customers;
  if (!q) saveCustomersCache(crmCustomers); // only cache the full list
  return crmCustomers;
}

function filterCustomersLocally(list, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return list;
  return list.filter((c) =>
    [c.name, c.phone, c.email].some((v) => (v || "").toLowerCase().includes(needle))
  );
}

async function populateLeadCrmFields() {
  const signedIn = !!getApiToken();
  if (leadCustomerField) leadCustomerField.classList.toggle("hidden", !signedIn);
  if (leadSiteField) leadSiteField.classList.toggle("hidden", !signedIn);
  if (!signedIn || !leadCustomerSelect) return;

  const customers = await fetchCustomers();
  leadCustomerSelect.innerHTML = `<option value="">New customer (auto-create from phone)</option>`;
  customers.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name} — ${c.phone}`;
    leadCustomerSelect.appendChild(opt);
  });
  if (leadSiteSelect) {
    leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
  }
}

async function populateLeadSites(customerId) {
  if (!leadSiteSelect || !customerId) {
    if (leadSiteSelect) leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
    return;
  }
  const { data, error } = await apiRequest("GET", `/api/sites?customerId=${encodeURIComponent(customerId)}`);
  leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
  if (error || !data?.sites) return;
  data.sites.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    leadSiteSelect.appendChild(opt);
  });
}

function openCustomersModal() {
  if (!customersModal) return;
  const signedIn = !!getApiToken();
  const showPanel = signedIn || hasCustomersCache();
  if (customersSignInPrompt) customersSignInPrompt.style.display = showPanel ? "none" : "block";
  if (customersPanel) customersPanel.style.display = showPanel ? "block" : "none";
  // + New requires a live connection (writes go to server)
  if (newCustomerBtn) newCustomerBtn.style.display = signedIn ? "" : "none";
  customersModal.classList.remove("hidden");
  if (showPanel) renderCustomersList();
}

function closeCustomersModal() {
  if (customersModal) customersModal.classList.add("hidden");
}

async function renderCustomersList(q = "") {
  if (!customersListEl) return;
  customersListEl.innerHTML = `<p class="muted tiny">Loading…</p>`;
  const customers = await fetchCustomers(q);
  customersListEl.innerHTML = "";
  if (!customers.length) {
    customersListEl.innerHTML = `<p class="muted" style="padding:12px;">No customers yet. Save a lead or tap + New.</p>`;
    return;
  }
  customers.forEach((c) => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div>
        <div class="name">${c.name}</div>
        <div class="phone">${c.phone}</div>
      </div>
      <div class="stats">${c.leadCount || 0} leads<br>${c.siteCount || 0} sites</div>
    `;
    card.addEventListener("click", () => {
      closeCustomersModal();
      openCustomerDetail(c.id);
    });
    customersListEl.appendChild(card);
  });
}

async function openCustomerDetail(customerId) {
  if (!customerDetailModal || !customerDetailBody) return;
  currentCustomerId = customerId;
  customerDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
  customerDetailModal.classList.remove("hidden");

  const online = !!getApiToken();
  const canManage = online;
  if (deleteCustomerBtn) deleteCustomerBtn.style.display = canManage ? "" : "none";
  if (editCustomerBtn) editCustomerBtn.style.display = canManage ? "" : "none";
  if (addSiteBtn) addSiteBtn.style.display = canManage ? "" : "none";

  // Offline: render from the cached list only
  if (!online) {
    const cached = loadCustomersCache().find((c) => c.id === customerId);
    if (!cached) {
      customerDetailBody.innerHTML = `<p class="muted">Sign in to view this customer's full profile.</p>`;
      return;
    }
    renderCustomerDetail(cached, [], [], { offline: true });
    return;
  }

  const [customerRes, sitesRes, timelineRes] = await Promise.all([
    apiRequest("GET", `/api/customers/${customerId}`),
    apiRequest("GET", `/api/sites?customerId=${encodeURIComponent(customerId)}`),
    apiRequest("GET", `/api/customers/${customerId}/timeline`),
  ]);

  const customer = customerRes.data?.customer;
  const sites = sitesRes.data?.sites || [];
  const timeline = timelineRes.data?.timeline || [];
  if (!customer) {
    customerDetailBody.innerHTML = `<p class="muted">Customer not found.</p>`;
    return;
  }

  renderCustomerDetail(customer, sites, timeline, { offline: false });
}

function renderCustomerDetail(customer, sites, timeline, { offline }) {
  currentCustomerObj = customer;
  const typeLabel = customer.customerType === "contractor" ? "Contractor" : "End customer";
  let html = `
    <div class="info">
      <div class="info-row"><span class="label">Name</span><strong>${customer.name}</strong></div>
      <div class="info-row"><span class="label">Phone</span><strong>${customer.phone}</strong></div>
      ${customer.email ? `<div class="info-row"><span class="label">Email</span>${customer.email}</div>` : ""}
      <div class="info-row"><span class="label">Type</span>${typeLabel}</div>
      ${customer.notes ? `<div class="info-row"><span class="label">Notes</span>${customer.notes}</div>` : ""}
    </div>
    <h4 style="margin:16px 0 8px;font-size:0.82rem;color:var(--muted);text-transform:uppercase;">Sites / Projects</h4>
    <div class="sites-list">
      ${sites.length ? sites.map((s) => `<span class="site-chip">${s.name}</span>`).join("") : `<span class="muted tiny">No sites yet</span>`}
    </div>
    <h4 style="margin:16px 0 8px;font-size:0.82rem;color:var(--muted);text-transform:uppercase;">Timeline</h4>
    <div class="timeline-list">
  `;

  if (offline) {
    html += `<p class="muted tiny">Showing cached profile. Sign in to load sites and full timeline.</p>`;
  } else if (!timeline.length) {
    html += `<p class="muted tiny">No activity yet.</p>`;
  } else {
    timeline.forEach((item) => {
      const when = new Date(item.ts).toLocaleString();
      const kind = (item.kind || "").replace(/_/g, " ");
      html += `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div>
            <div class="kind">${kind}</div>
            <div><strong>${item.title || "Activity"}</strong></div>
            <div class="when">${when}${item.siteName ? ` · ${item.siteName}` : ""}</div>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  customerDetailBody.innerHTML = html;
  const titleEl = document.getElementById("customerDetailTitle");
  if (titleEl) titleEl.textContent = customer.name;
}

function closeCustomerDetail() {
  if (customerDetailModal) customerDetailModal.classList.add("hidden");
  currentCustomerId = null;
}

function openNewCustomerModal(customer = null) {
  if (!newCustomerModal) return;
  editingCustomerId = customer?.id || null;
  if (newCustomerTitle) newCustomerTitle.textContent = customer ? "Edit Customer" : "New Customer";
  if (saveCustomerBtn) saveCustomerBtn.textContent = customer ? "Update Customer" : "Save Customer";

  const nameEl = document.getElementById("newCustomerName");
  const phoneEl = document.getElementById("newCustomerPhone");
  const emailEl = document.getElementById("newCustomerEmail");
  const typeEl = document.getElementById("newCustomerType");
  const notesEl = document.getElementById("newCustomerNotes");
  if (nameEl) nameEl.value = customer?.name || "";
  if (phoneEl) phoneEl.value = customer?.phone || "";
  if (emailEl) emailEl.value = customer?.email || "";
  if (typeEl) typeEl.value = customer?.customerType || "end_customer";
  if (notesEl) notesEl.value = customer?.notes || "";

  newCustomerModal.classList.remove("hidden");
}

function closeNewCustomerModal() {
  if (newCustomerModal) newCustomerModal.classList.add("hidden");
  if (newCustomerForm) newCustomerForm.reset();
  editingCustomerId = null;
}

async function handleNewCustomerSubmit(e) {
  e.preventDefault();
  const name = (document.getElementById("newCustomerName")?.value || "").trim();
  const phone = (document.getElementById("newCustomerPhone")?.value || "").trim();
  const email = (document.getElementById("newCustomerEmail")?.value || "").trim();
  const customerType = document.getElementById("newCustomerType")?.value || "end_customer";
  const notes = (document.getElementById("newCustomerNotes")?.value || "").trim();
  if (!name || !phone) return;

  const payload = { name, phone, email, notes, customerType };
  const { error } = editingCustomerId
    ? await apiRequest("PUT", `/api/customers/${editingCustomerId}`, payload)
    : await apiRequest("POST", "/api/customers", payload);

  if (error) {
    showTransientToast(error);
    return;
  }

  const wasEditing = editingCustomerId;
  closeNewCustomerModal();
  showTransientToast(`Customer ${name} ${wasEditing ? "updated" : "saved"}.`);
  await fetchCustomers(); // refresh cache
  if (wasEditing && currentCustomerId === wasEditing) {
    openCustomerDetail(wasEditing);
  } else {
    renderCustomersList(customerSearchInput?.value || "");
  }
}

function editCurrentCustomer() {
  if (currentCustomerObj) openNewCustomerModal(currentCustomerObj);
}

async function deleteCurrentCustomer() {
  if (!currentCustomerId) return;
  const name = currentCustomerObj?.name || "this customer";
  if (!confirm(`Delete ${name}? Their sites and timeline links will be removed. Captured leads are kept.`)) return;

  const { error } = await apiRequest("DELETE", `/api/customers/${currentCustomerId}`);
  if (error) {
    showTransientToast(error);
    return;
  }
  showTransientToast("Customer deleted.");
  closeCustomerDetail();
  await fetchCustomers();
  openCustomersModal();
}

function openSiteModal() {
  if (!siteModal || !currentCustomerId) return;
  if (siteForm) siteForm.reset();
  siteModal.classList.remove("hidden");
  setTimeout(() => document.getElementById("siteName")?.focus(), 0);
}

function closeSiteModal() {
  if (siteModal) siteModal.classList.add("hidden");
}

async function handleSiteSubmit(e) {
  e.preventDefault();
  if (!currentCustomerId) return;
  const name = (document.getElementById("siteName")?.value || "").trim();
  const address = (document.getElementById("siteAddress")?.value || "").trim();
  const status = document.getElementById("siteStatus")?.value || "active";
  const notes = (document.getElementById("siteNotes")?.value || "").trim();
  if (!name) return;

  const { error } = await apiRequest("POST", "/api/sites", {
    customerId: currentCustomerId,
    name,
    address,
    status,
    notes,
  });
  if (error) {
    showTransientToast(error);
    return;
  }
  closeSiteModal();
  showTransientToast("Site added.");
  openCustomerDetail(currentCustomerId);
}

/* ===================== Phase 6: Quotes & Orders ===================== */

const QUOTE_STATUS_LABELS = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected", converted: "Converted" };
const ORDER_STATUS_LABELS = { pending: "Pending", confirmed: "Confirmed", fulfilled: "Fulfilled", cancelled: "Cancelled" };
const QUOTE_ALL_STATUSES = ["draft", "sent", "accepted", "rejected", "converted"];
const CLIENT_QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"];
const ORDER_STATUSES = ["pending", "confirmed", "fulfilled", "cancelled"];

function blankItem() {
  return { description: "", brand: "", quantity: 1, unitPrice: 0, unit: "litre", shadeId: "" };
}

function openQuotesModal() {
  if (!quotesModal) return;
  const signedIn = !!getApiToken();
  if (quotesSignInPrompt) quotesSignInPrompt.style.display = signedIn ? "none" : "block";
  if (quotesPanel) quotesPanel.style.display = signedIn ? "block" : "none";
  quotesModal.classList.remove("hidden");
  if (signedIn) switchCommerceTab(commerceTab);
}

function closeQuotesModal() {
  if (quotesModal) quotesModal.classList.add("hidden");
}

function switchCommerceTab(tab) {
  commerceTab = tab;
  if (quotesTabBtn) quotesTabBtn.classList.toggle("active", tab === "quotes");
  if (ordersTabBtn) ordersTabBtn.classList.toggle("active", tab === "orders");
  if (newQuoteBtn) newQuoteBtn.style.display = tab === "quotes" ? "" : "none";
  buildStatusFilter();
  renderDocList();
}

function buildStatusFilter() {
  if (!docStatusFilter) return;
  const statuses = commerceTab === "quotes" ? QUOTE_ALL_STATUSES : ORDER_STATUSES;
  const labels = commerceTab === "quotes" ? QUOTE_STATUS_LABELS : ORDER_STATUS_LABELS;
  docStatusFilter.innerHTML =
    `<option value="">All statuses</option>` +
    statuses.map((s) => `<option value="${s}">${labels[s]}</option>`).join("");
}

async function renderDocList() {
  if (!docList) return;
  docList.innerHTML = `<p class="muted tiny">Loading…</p>`;
  const status = docStatusFilter?.value || "";
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";

  if (commerceTab === "quotes") {
    const { data, error } = await apiRequest("GET", `/api/quotes${qs}`);
    if (error) { docList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
    const quotes = data?.quotes || [];
    if (!quotes.length) {
      docList.innerHTML = `<p class="muted" style="padding:12px;">No quotes yet. Tap + New Quote.</p>`;
      return;
    }
    docList.innerHTML = "";
    quotes.forEach((q) => docList.appendChild(docCard({
      number: q.quoteNumber,
      sub: `${escHtml(q.customerName || "—")}${q.siteName ? " · " + escHtml(q.siteName) : ""} · ${q.itemCount || 0} items`,
      total: q.total,
      status: q.status,
      labels: QUOTE_STATUS_LABELS,
      onClick: () => openDocDetail("quote", q.id),
    })));
  } else {
    const { data, error } = await apiRequest("GET", `/api/orders${qs}`);
    if (error) { docList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
    const orders = data?.orders || [];
    if (!orders.length) {
      docList.innerHTML = `<p class="muted" style="padding:12px;">No orders yet. Convert an accepted quote to create one.</p>`;
      return;
    }
    docList.innerHTML = "";
    orders.forEach((o) => docList.appendChild(docCard({
      number: o.orderNumber,
      sub: `${escHtml(o.customerName || "—")}${o.quoteNumber ? " · from " + escHtml(o.quoteNumber) : ""} · ${o.itemCount || 0} items`,
      total: o.total,
      status: o.status,
      labels: ORDER_STATUS_LABELS,
      onClick: () => openDocDetail("order", o.id),
    })));
  }
}

function docCard({ number, sub, total, status, labels, onClick }) {
  const card = document.createElement("div");
  card.className = "doc-card";
  card.innerHTML = `
    <div>
      <div class="doc-number">${escHtml(number)}</div>
      <div class="doc-sub">${sub}</div>
    </div>
    <div class="doc-right">
      <div class="doc-total">${fmtMoney(total)}</div>
      ${statusBadge(status, labels)}
    </div>`;
  card.addEventListener("click", onClick);
  return card;
}

async function openQuoteForm(quote = null) {
  if (!quoteFormModal) return;
  editingQuoteId = quote?.id || null;
  if (quoteFormTitle) quoteFormTitle.textContent = quote ? `Edit ${quote.quoteNumber}` : "New Quote";
  if (saveQuoteBtn) saveQuoteBtn.textContent = quote ? "Update Quote" : "Save Quote";
  if (quoteFormError) quoteFormError.textContent = "";

  populateShadePicker();
  await populateQuoteCustomers(quote?.customerId);
  await populateQuoteSites(quote?.customerId, quote?.siteId);

  if (quoteDiscount) quoteDiscount.value = quote?.discount ?? 0;
  if (quoteTaxRate) quoteTaxRate.value = quote?.taxRate ?? 0;
  if (quoteNotes) quoteNotes.value = quote?.notes || "";

  quoteItemsList.innerHTML = "";
  const items = quote?.items?.length ? quote.items : [blankItem()];
  items.forEach(addQuoteItemRow);
  recomputeQuoteTotals();
  quoteFormModal.classList.remove("hidden");
}

function closeQuoteForm() {
  if (quoteFormModal) quoteFormModal.classList.add("hidden");
  editingQuoteId = null;
}

async function populateQuoteCustomers(selectedId) {
  const customers = await fetchCustomers();
  quoteCustomerSelect.innerHTML =
    `<option value="">Select customer…</option>` +
    customers.map((c) => `<option value="${c.id}">${escHtml(c.name)} — ${escHtml(c.phone)}</option>`).join("");
  if (selectedId) quoteCustomerSelect.value = selectedId;
}

async function populateQuoteSites(customerId, selectedId) {
  quoteSiteSelect.innerHTML = `<option value="">No site</option>`;
  if (!customerId) return;
  const { data } = await apiRequest("GET", `/api/sites?customerId=${encodeURIComponent(customerId)}`);
  (data?.sites || []).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    quoteSiteSelect.appendChild(opt);
  });
  if (selectedId) quoteSiteSelect.value = selectedId;
}

function populateShadePicker() {
  if (!quoteShadePicker) return;
  const cat = Array.isArray(SHADE_CATALOG) ? SHADE_CATALOG : [];
  quoteShadePicker.innerHTML =
    `<option value="">Add a shade from the catalog…</option>` +
    cat.map((s, i) =>
      `<option value="${i}">${escHtml(s.name)}${s.brand ? " — " + escHtml(s.brand) : ""}${s.pricePerL ? ` (₹${s.pricePerL}/L)` : ""}</option>`
    ).join("");
}

function onShadePicked() {
  const idx = quoteShadePicker.value;
  if (idx === "") return;
  const s = SHADE_CATALOG[Number(idx)];
  if (s) {
    const litres = Math.ceil((ROOM_SQ_M * 2) / COVERAGE_SQ_M_PER_L);
    addQuoteItemRow({
      description: s.brand ? `${s.name} (${s.brand})` : s.name,
      brand: s.brand || "",
      quantity: litres,
      unitPrice: s.pricePerL || 0,
      unit: "litre",
      shadeId: s.id || "",
    });
    recomputeQuoteTotals();
  }
  quoteShadePicker.value = "";
}

function addQuoteItemRow(item) {
  const row = document.createElement("div");
  row.className = "quote-item-row";
  row.dataset.shadeId = item.shadeId || "";
  const qty = item.quantity ?? 1;
  const price = item.unitPrice ?? 0;
  row.innerHTML = `
    <div class="qi-desc-wrap">
      <input class="qi-desc" type="text" placeholder="Description" value="${escHtml(item.description)}" />
      <input class="qi-brand" type="text" placeholder="Brand (optional)" value="${escHtml(item.brand || "")}" />
    </div>
    <input class="qi-qty" type="number" min="0" step="0.01" value="${qty}" />
    <input class="qi-price" type="number" min="0" step="0.01" value="${price}" />
    <div class="qi-line">${fmtMoney((Number(qty) || 0) * (Number(price) || 0))}</div>
    <button type="button" class="qi-remove" title="Remove line">×</button>`;
  row.querySelector(".qi-remove").addEventListener("click", () => {
    row.remove();
    ensureAtLeastOneRow();
    recomputeQuoteTotals();
  });
  row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recomputeQuoteTotals));
  quoteItemsList.appendChild(row);
}

function ensureAtLeastOneRow() {
  if (quoteItemsList && quoteItemsList.querySelectorAll(".quote-item-row").length === 0) {
    addQuoteItemRow(blankItem());
  }
}

function recomputeQuoteTotals() {
  if (!quoteItemsList || !quoteTotals) return;
  let subtotal = 0;
  quoteItemsList.querySelectorAll(".quote-item-row").forEach((row) => {
    const qty = Number(row.querySelector(".qi-qty").value) || 0;
    const price = Number(row.querySelector(".qi-price").value) || 0;
    const line = round2(qty * price);
    row.querySelector(".qi-line").textContent = fmtMoney(line);
    subtotal += line;
  });
  subtotal = round2(subtotal);
  const discount = Number(quoteDiscount?.value) || 0;
  const taxRate = Number(quoteTaxRate?.value) || 0;
  const base = Math.max(0, round2(subtotal - discount));
  const tax = round2((base * taxRate) / 100);
  const total = round2(base + tax);
  quoteTotals.innerHTML = `
    <div class="t-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
    <div class="t-row"><span>Discount</span><span>− ${fmtMoney(discount)}</span></div>
    <div class="t-row"><span>Tax (${taxRate}%)</span><span>${fmtMoney(tax)}</span></div>
    <div class="t-row grand"><span>Total</span><span>${fmtMoney(total)}</span></div>`;
}

function collectQuoteItems() {
  return [...quoteItemsList.querySelectorAll(".quote-item-row")]
    .map((row, i) => ({
      shadeId: row.dataset.shadeId || "",
      description: row.querySelector(".qi-desc").value.trim(),
      brand: row.querySelector(".qi-brand").value.trim(),
      quantity: Number(row.querySelector(".qi-qty").value) || 0,
      unitPrice: Number(row.querySelector(".qi-price").value) || 0,
      unit: "litre",
      sortOrder: i,
    }))
    .filter((it) => it.description);
}

async function handleQuoteSubmit(e) {
  e.preventDefault();
  const customerId = quoteCustomerSelect.value;
  if (!customerId) { quoteFormError.textContent = "Select a customer."; return; }
  const items = collectQuoteItems();
  if (!items.length) { quoteFormError.textContent = "Add at least one line item with a description."; return; }

  const payload = {
    customerId,
    siteId: quoteSiteSelect.value || null,
    discount: Number(quoteDiscount.value) || 0,
    taxRate: Number(quoteTaxRate.value) || 0,
    notes: quoteNotes.value.trim(),
    items,
  };

  if (saveQuoteBtn) saveQuoteBtn.disabled = true;
  const { error } = editingQuoteId
    ? await apiRequest("PUT", `/api/quotes/${editingQuoteId}`, payload)
    : await apiRequest("POST", "/api/quotes", payload);
  if (saveQuoteBtn) saveQuoteBtn.disabled = false;

  if (error) { quoteFormError.textContent = error; return; }
  const wasEditing = editingQuoteId;
  closeQuoteForm();
  showTransientToast(wasEditing ? "Quote updated." : "Quote created.");
  commerceTab = "quotes";
  if (docStatusFilter) docStatusFilter.value = "";
  buildStatusFilter();
  renderDocList();
}

async function openDocDetail(type, id) {
  if (!docDetailModal || !docDetailBody) return;
  docDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
  if (docDetailActions) docDetailActions.innerHTML = "";
  docDetailModal.classList.remove("hidden");

  const path = type === "quote" ? `/api/quotes/${id}` : `/api/orders/${id}`;
  const { data, error } = await apiRequest("GET", path);
  const doc = type === "quote" ? data?.quote : data?.order;
  if (error || !doc) {
    docDetailBody.innerHTML = `<p class="muted">${escHtml(error || "Not found.")}</p>`;
    return;
  }
  currentDoc = { type, data: doc };
  renderDocDetail(type, doc);
}

function closeDocDetail() {
  if (docDetailModal) docDetailModal.classList.add("hidden");
  currentDoc = null;
}

function renderDocDetail(type, doc) {
  const isQuote = type === "quote";
  const number = isQuote ? doc.quoteNumber : doc.orderNumber;
  const labels = isQuote ? QUOTE_STATUS_LABELS : ORDER_STATUS_LABELS;
  if (docDetailTitle) docDetailTitle.textContent = number;

  const itemRows = (doc.items || []).map((it) => `
    <tr>
      <td>${escHtml(it.description)}${it.brand ? `<div class="muted tiny">${escHtml(it.brand)}</div>` : ""}</td>
      <td>${it.quantity}</td>
      <td>${fmtMoney(it.unitPrice)}</td>
      <td>${fmtMoney(it.lineTotal)}</td>
    </tr>`).join("");

  docDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Status</span>${statusBadge(doc.status, labels)}</div>
      <div class="info-row"><span class="label">Customer</span><strong>${escHtml(doc.customerName || "—")}</strong></div>
      ${doc.siteName ? `<div class="info-row"><span class="label">Site</span>${escHtml(doc.siteName)}</div>` : ""}
      ${!isQuote && doc.quoteNumber ? `<div class="info-row"><span class="label">From quote</span>${escHtml(doc.quoteNumber)}</div>` : ""}
      ${doc.notes ? `<div class="info-row"><span class="label">Notes</span>${escHtml(doc.notes)}</div>` : ""}
    </div>
    <table class="doc-detail-items">
      <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="quote-totals">
      <div class="t-row"><span>Subtotal</span><span>${fmtMoney(doc.subtotal)}</span></div>
      <div class="t-row"><span>Discount</span><span>− ${fmtMoney(doc.discount)}</span></div>
      <div class="t-row"><span>Tax (${doc.taxRate}%)</span><span>${fmtMoney(doc.taxAmount)}</span></div>
      <div class="t-row grand"><span>Total</span><span>${fmtMoney(doc.total)}</span></div>
    </div>`;

  renderDocActions(type, doc);
}

function actionBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderDocActions(type, doc) {
  if (!docDetailActions) return;
  docDetailActions.innerHTML = "";

  if (type === "quote" && doc.status !== "converted") {
    const sel = document.createElement("select");
    sel.className = "doc-status-select";
    sel.innerHTML = CLIENT_QUOTE_STATUSES
      .map((s) => `<option value="${s}" ${s === doc.status ? "selected" : ""}>${QUOTE_STATUS_LABELS[s]}</option>`)
      .join("");
    sel.addEventListener("change", () => updateDocStatus("quote", doc.id, sel.value));
    docDetailActions.appendChild(sel);
    docDetailActions.appendChild(actionBtn("Delete", "button ghost danger", () => deleteDoc("quote", doc.id)));
    docDetailActions.appendChild(actionBtn("Edit", "button ghost", () => editQuote(doc)));
    docDetailActions.appendChild(actionBtn("Convert to Order", "button primary", () => convertQuote(doc.id)));
    return;
  }

  if (type === "quote") {
    const note = document.createElement("span");
    note.className = "muted tiny";
    note.style.marginRight = "auto";
    note.textContent = "Converted to an order.";
    docDetailActions.appendChild(note);
    docDetailActions.appendChild(actionBtn("Delete", "button ghost danger", () => deleteDoc("quote", doc.id)));
    docDetailActions.appendChild(actionBtn("Done", "button primary", closeDocDetail));
    return;
  }

  // order
  const sel = document.createElement("select");
  sel.className = "doc-status-select";
  sel.innerHTML = ORDER_STATUSES
    .map((s) => `<option value="${s}" ${s === doc.status ? "selected" : ""}>${ORDER_STATUS_LABELS[s]}</option>`)
    .join("");
  sel.addEventListener("change", () => updateDocStatus("order", doc.id, sel.value));
  docDetailActions.appendChild(sel);
  docDetailActions.appendChild(actionBtn("Delete", "button ghost danger", () => deleteDoc("order", doc.id)));
  docDetailActions.appendChild(actionBtn("Done", "button primary", closeDocDetail));
}

async function updateDocStatus(type, id, status) {
  const path = type === "quote" ? `/api/quotes/${id}/status` : `/api/orders/${id}/status`;
  const { error } = await apiRequest("PATCH", path, { status });
  if (error) { showTransientToast(error); return; }
  showTransientToast(`${type === "quote" ? "Quote" : "Order"} status updated.`);
  openDocDetail(type, id);
}

async function convertQuote(id) {
  if (!confirm("Convert this quote to an order? The quote will be locked from further edits.")) return;
  const { data, error } = await apiRequest("POST", `/api/quotes/${id}/convert`);
  if (error) { showTransientToast(error); return; }
  showTransientToast(`Order ${data.order.orderNumber} created.`);
  closeDocDetail();
  commerceTab = "orders";
  if (docStatusFilter) docStatusFilter.value = "";
  openQuotesModal();
}

async function deleteDoc(type, id) {
  const label = type === "quote" ? "quote" : "order";
  if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
  const path = type === "quote" ? `/api/quotes/${id}` : `/api/orders/${id}`;
  const { error } = await apiRequest("DELETE", path);
  if (error) { showTransientToast(error); return; }
  showTransientToast(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
  closeDocDetail();
  renderDocList();
}

function editQuote(doc) {
  closeDocDetail();
  openQuoteForm(doc);
}

/* ===================== Phase 6: Inventory ===================== */

const INV_STATUS_LABELS = { in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock" };

function openInventoryModal() {
  if (!inventoryModal) return;
  const signedIn = !!getApiToken();
  if (inventorySignInPrompt) inventorySignInPrompt.style.display = signedIn ? "none" : "block";
  if (inventoryPanel) inventoryPanel.style.display = signedIn ? "block" : "none";
  inventoryModal.classList.remove("hidden");
  if (signedIn) {
    renderInventorySummary();
    renderInventoryList();
  }
}

function closeInventoryModal() {
  if (inventoryModal) inventoryModal.classList.add("hidden");
}

async function renderInventorySummary() {
  if (!inventorySummary) return;
  const { data, error } = await apiRequest("GET", "/api/inventory/summary");
  if (error || !data?.summary) { inventorySummary.innerHTML = ""; return; }
  const s = data.summary;
  inventorySummary.innerHTML = `
    <div class="inv-chip"><div class="n">${s.total}</div><div class="l">Items</div></div>
    <div class="inv-chip low"><div class="n">${s.lowStock}</div><div class="l">Low</div></div>
    <div class="inv-chip out"><div class="n">${s.outOfStock}</div><div class="l">Out</div></div>
    <div class="inv-chip"><div class="n">${fmtMoney(s.stockValue)}</div><div class="l">Stock value</div></div>`;
}

async function renderInventoryList() {
  if (!inventoryList) return;
  inventoryList.innerHTML = `<p class="muted tiny">Loading…</p>`;
  const q = (inventorySearchInput?.value || "").trim();
  const status = inventoryStatusFilter?.value || "";
  const params = [];
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (status) params.push(`status=${encodeURIComponent(status)}`);
  const qs = params.length ? `?${params.join("&")}` : "";

  const { data, error } = await apiRequest("GET", `/api/inventory${qs}`);
  if (error) { inventoryList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
  const items = data?.items || [];
  if (!items.length) {
    inventoryList.innerHTML = `<p class="muted" style="padding:12px;">No items${q || status ? " match this filter" : " yet. Tap + New Item"}.</p>`;
    return;
  }
  inventoryList.innerHTML = "";
  items.forEach((it) => inventoryList.appendChild(invCard(it)));
}

function invCard(it) {
  const card = document.createElement("div");
  card.className = "inv-card" + (it.status === "low_stock" ? " low" : it.status === "out_of_stock" ? " out" : "");
  card.innerHTML = `
    <div>
      <div class="name">${escHtml(it.name)}</div>
      <div class="meta">${it.brand ? escHtml(it.brand) + " · " : ""}${it.sku ? escHtml(it.sku) + " · " : ""}${statusBadge(it.status, INV_STATUS_LABELS)}</div>
    </div>
    <div class="qty">${it.quantity} <small>${escHtml(it.unit)}</small></div>`;
  card.addEventListener("click", () => openInventoryDetail(it.id));
  return card;
}

function populateInvShadePicker(selectedShadeId) {
  if (!invShadePicker) return;
  const cat = Array.isArray(SHADE_CATALOG) ? SHADE_CATALOG : [];
  invShadePicker.innerHTML =
    `<option value="">No linked shade</option>` +
    cat.map((s) =>
      `<option value="${escHtml(s.id || "")}" data-price="${s.pricePerL || 0}" data-brand="${escHtml(s.brand || "")}" data-name="${escHtml(s.name || "")}">${escHtml(s.name)}${s.brand ? " — " + escHtml(s.brand) : ""}</option>`
    ).join("");
  if (selectedShadeId) invShadePicker.value = selectedShadeId;
}

function openInventoryForm(item = null) {
  if (!inventoryFormModal) return;
  editingInventoryId = item?.id || null;
  if (inventoryFormTitle) inventoryFormTitle.textContent = item ? "Edit Item" : "New Item";
  if (saveInventoryBtn) saveInventoryBtn.textContent = item ? "Update Item" : "Save Item";
  if (inventoryFormError) inventoryFormError.textContent = "";

  populateInvShadePicker(item?.shadeId);
  setVal("invName", item?.name || "");
  setVal("invBrand", item?.brand || "");
  setVal("invSku", item?.sku || "");
  setVal("invUnit", item?.unit || "litre");
  setVal("invQuantity", item?.quantity ?? 0);
  setVal("invReorder", item?.reorderLevel ?? 0);
  setVal("invUnitPrice", item?.unitPrice ?? 0);
  setVal("invCostPrice", item?.costPrice ?? 0);
  setVal("invNotes", item?.notes || "");

  // Opening quantity is only editable on create; existing stock moves via adjust.
  if (invQtyField) invQtyField.style.display = item ? "none" : "";

  inventoryFormModal.classList.remove("hidden");
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function closeInventoryForm() {
  if (inventoryFormModal) inventoryFormModal.classList.add("hidden");
  if (inventoryForm) inventoryForm.reset();
  editingInventoryId = null;
}

async function handleInventorySubmit(e) {
  e.preventDefault();
  const name = (document.getElementById("invName")?.value || "").trim();
  if (!name) { inventoryFormError.textContent = "Product name is required."; return; }

  const payload = {
    name,
    brand: (document.getElementById("invBrand")?.value || "").trim(),
    sku: (document.getElementById("invSku")?.value || "").trim(),
    unit: (document.getElementById("invUnit")?.value || "litre").trim(),
    reorderLevel: Number(document.getElementById("invReorder")?.value) || 0,
    unitPrice: Number(document.getElementById("invUnitPrice")?.value) || 0,
    costPrice: Number(document.getElementById("invCostPrice")?.value) || 0,
    shadeId: invShadePicker?.value || "",
    notes: (document.getElementById("invNotes")?.value || "").trim(),
  };
  if (!editingInventoryId) {
    payload.quantity = Number(document.getElementById("invQuantity")?.value) || 0;
  }

  if (saveInventoryBtn) saveInventoryBtn.disabled = true;
  const { error } = editingInventoryId
    ? await apiRequest("PUT", `/api/inventory/${editingInventoryId}`, payload)
    : await apiRequest("POST", "/api/inventory", payload);
  if (saveInventoryBtn) saveInventoryBtn.disabled = false;

  if (error) { inventoryFormError.textContent = error; return; }
  const wasEditing = editingInventoryId;
  closeInventoryForm();
  showTransientToast(wasEditing ? "Item updated." : "Item added.");
  renderInventorySummary();
  if (wasEditing && currentInventoryId === wasEditing) {
    openInventoryDetail(wasEditing);
  } else {
    renderInventoryList();
  }
}

async function openInventoryDetail(id) {
  if (!inventoryDetailModal || !inventoryDetailBody) return;
  currentInventoryId = id;
  inventoryDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
  inventoryDetailModal.classList.remove("hidden");

  const { data, error } = await apiRequest("GET", `/api/inventory/${id}`);
  const item = data?.item;
  if (error || !item) {
    inventoryDetailBody.innerHTML = `<p class="muted">${escHtml(error || "Not found.")}</p>`;
    return;
  }
  currentInventoryObj = item;
  renderInventoryDetail(item);
}

function renderInventoryDetail(item) {
  if (inventoryDetailTitle) inventoryDetailTitle.textContent = item.name;
  const movements = item.movements || [];
  const movementRows = movements.length
    ? movements.map((m) => `
        <tr>
          <td>${new Date(m.createdAt).toLocaleString()}${m.reason ? `<div class="muted tiny">${escHtml(m.reason)}</div>` : ""}</td>
          <td class="${m.delta >= 0 ? "pos" : "neg"}">${m.delta >= 0 ? "+" : ""}${m.delta}</td>
          <td>${m.balanceAfter}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="muted tiny">No movements yet.</td></tr>`;

  inventoryDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Status</span>${statusBadge(item.status, INV_STATUS_LABELS)}</div>
      <div class="info-row"><span class="label">On hand</span><strong>${item.quantity} ${escHtml(item.unit)}</strong></div>
      <div class="info-row"><span class="label">Reorder level</span>${item.reorderLevel} ${escHtml(item.unit)}</div>
      ${item.brand ? `<div class="info-row"><span class="label">Brand</span>${escHtml(item.brand)}</div>` : ""}
      ${item.sku ? `<div class="info-row"><span class="label">SKU</span>${escHtml(item.sku)}</div>` : ""}
      <div class="info-row"><span class="label">Selling</span>${fmtMoney(item.unitPrice)}</div>
      <div class="info-row"><span class="label">Cost</span>${fmtMoney(item.costPrice)}</div>
      ${item.notes ? `<div class="info-row"><span class="label">Notes</span>${escHtml(item.notes)}</div>` : ""}
    </div>
    <div class="inv-adjust">
      <h4>Adjust stock</h4>
      <div class="inv-adjust-row">
        <button type="button" class="button tiny ghost" id="invReceiveBtn">Receive</button>
        <button type="button" class="button tiny ghost" id="invIssueBtn">Issue</button>
        <input class="inv-delta" id="invDeltaInput" type="number" step="0.01" placeholder="± qty" />
        <input class="inv-reason" id="invReasonInput" type="text" placeholder="Reason (optional)" />
        <button type="button" class="button tiny primary" id="invApplyBtn">Apply</button>
      </div>
    </div>
    <h4 class="section-label">Recent movements</h4>
    <table class="inv-movements">
      <thead><tr><th>When</th><th>Change</th><th>Balance</th></tr></thead>
      <tbody>${movementRows}</tbody>
    </table>`;

  const deltaInput = document.getElementById("invDeltaInput");
  document.getElementById("invReceiveBtn")?.addEventListener("click", () => {
    const v = Math.abs(Number(deltaInput.value) || 0);
    deltaInput.value = v || "";
    deltaInput.focus();
  });
  document.getElementById("invIssueBtn")?.addEventListener("click", () => {
    const v = Math.abs(Number(deltaInput.value) || 0);
    deltaInput.value = v ? -v : "";
    deltaInput.focus();
  });
  document.getElementById("invApplyBtn")?.addEventListener("click", () => applyInventoryAdjust(item.id));
}

async function applyInventoryAdjust(id) {
  const delta = Number(document.getElementById("invDeltaInput")?.value);
  const reason = (document.getElementById("invReasonInput")?.value || "").trim();
  if (!delta) { showTransientToast("Enter a non-zero quantity change."); return; }
  const { error } = await apiRequest("POST", `/api/inventory/${id}/adjust`, { delta, reason });
  if (error) { showTransientToast(error); return; }
  showTransientToast("Stock updated.");
  renderInventorySummary();
  openInventoryDetail(id);
}

function closeInventoryDetail() {
  if (inventoryDetailModal) inventoryDetailModal.classList.add("hidden");
  currentInventoryId = null;
  currentInventoryObj = null;
}

function editCurrentInventory() {
  if (currentInventoryObj) {
    closeInventoryDetail();
    openInventoryForm(currentInventoryObj);
  }
}

async function deleteCurrentInventory() {
  if (!currentInventoryId) return;
  const name = currentInventoryObj?.name || "this item";
  if (!confirm(`Delete ${name}? Its stock history will be removed.`)) return;
  const { error } = await apiRequest("DELETE", `/api/inventory/${currentInventoryId}`);
  if (error) { showTransientToast(error); return; }
  showTransientToast("Item deleted.");
  closeInventoryDetail();
  renderInventorySummary();
  renderInventoryList();
}

/* ===================== Phase 6: Credit Ledger & Reminders ===================== */

const LEDGER_SOURCE_LABELS = {
  order: "Order",
  payment: "Payment",
  manual: "Manual",
  adjustment: "Adjustment",
  reversal: "Reversal",
};
const REMINDER_CHANNEL_LABELS = {
  manual: "Logged",
  call: "Call",
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
};

function openLedgerModal() {
  if (!ledgerModal) return;
  const signedIn = !!getApiToken();
  if (ledgerSignInPrompt) ledgerSignInPrompt.style.display = signedIn ? "none" : "block";
  if (ledgerPanel) ledgerPanel.style.display = signedIn ? "block" : "none";
  ledgerModal.classList.remove("hidden");
  if (signedIn) {
    renderLedgerSummary();
    renderLedgerList();
  }
}

function closeLedgerModal() {
  if (ledgerModal) ledgerModal.classList.add("hidden");
}

async function renderLedgerSummary() {
  if (!ledgerSummary) return;
  const { data, error } = await apiRequest("GET", "/api/ledger/summary");
  if (error || !data?.summary) { ledgerSummary.innerHTML = ""; return; }
  const s = data.summary;
  ledgerSummary.innerHTML = `
    <div class="inv-chip"><div class="n">${fmtMoney(s.receivable)}</div><div class="l">Receivable</div></div>
    <div class="inv-chip out"><div class="n">${fmtMoney(s.overdueAmount)}</div><div class="l">Overdue</div></div>
    <div class="inv-chip"><div class="n">${s.debtors}</div><div class="l">Owe you</div></div>
    <div class="inv-chip low"><div class="n">${s.overdueCustomers}</div><div class="l">Overdue</div></div>`;
}

const ledgerPaginator = createPaginator();

function ledgerListQuery() {
  const q = (ledgerSearchInput?.value || "").trim();
  const overdue = ledgerFilter?.value === "overdue";
  const params = [];
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (overdue) params.push("overdue=true");
  let path = "/api/ledger/customers";
  if (params.length) path += `?${params.join("&")}`;
  return path;
}

// Renders the first page (resets paging). Safe to pass as an event listener.
async function renderLedgerList() {
  if (!ledgerList) return;
  ledgerPaginator.reset();
  ledgerList.innerHTML = `<p class="muted tiny">Loading…</p>`;
  await fetchLedgerPage(false);
}

async function loadMoreLedger() {
  await fetchLedgerPage(true);
}

async function fetchLedgerPage(append) {
  if (!ledgerList) return;
  const path = withPageParams(ledgerListQuery(), ledgerPaginator.params());
  const { data, error } = await apiRequest("GET", path);
  const oldBtn = ledgerList.querySelector(".load-more-row");
  if (oldBtn) oldBtn.remove();
  if (error) {
    if (!append) ledgerList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`;
    return;
  }
  const customers = data?.customers || [];
  ledgerPaginator.absorb(data?.pagination);
  if (!append) ledgerList.innerHTML = "";
  if (!customers.length && !append) {
    const q = (ledgerSearchInput?.value || "").trim();
    const overdue = ledgerFilter?.value === "overdue";
    ledgerList.innerHTML = `<p class="muted" style="padding:12px;">${
      overdue || q ? "No accounts match this filter." : "No outstanding balances. Order totals post here automatically."
    }</p>`;
    return;
  }
  customers.forEach((c) => ledgerList.appendChild(ledgerCard(c)));
  if (ledgerPaginator.hasMore) ledgerList.appendChild(ledgerLoadMoreRow());
}

function ledgerLoadMoreRow() {
  const row = document.createElement("div");
  row.className = "load-more-row";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "button ghost";
  const remaining = Math.max(0, ledgerPaginator.total - ledgerPaginator.offset);
  btn.textContent = remaining > 0 ? `Load more (${remaining} more)` : "Load more";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Loading…";
    loadMoreLedger();
  });
  row.appendChild(btn);
  return row;
}

function ledgerCard(c) {
  const card = document.createElement("div");
  card.className = "inv-card" + (c.overdue ? " out" : "");
  const overdueTag = c.overdue
    ? `<span class="status-badge out_of_stock">Overdue ${overdueDaysLabel(c.oldestOverdueDate)}</span>`
    : "";
  const reminded = c.lastReminderAt
    ? ` · reminded ${new Date(c.lastReminderAt).toLocaleDateString()}`
    : "";
  card.innerHTML = `
    <div>
      <div class="name">${escHtml(c.customerName)}</div>
      <div class="meta">${escHtml(c.phone || "")}${reminded} ${overdueTag}</div>
    </div>
    <div class="qty">${fmtMoney(c.balance)}<small>owes</small></div>`;
  card.addEventListener("click", () => openLedgerDetail(c.customerId));
  return card;
}

async function openLedgerDetail(customerId) {
  if (!ledgerDetailModal || !ledgerDetailBody) return;
  currentLedgerCustomerId = customerId;
  ledgerDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
  ledgerDetailModal.classList.remove("hidden");

  const { data, error } = await apiRequest("GET", `/api/ledger/customers/${customerId}`);
  const ledger = data?.ledger;
  if (error || !ledger) {
    ledgerDetailBody.innerHTML = `<p class="muted">${escHtml(error || "Not found.")}</p>`;
    return;
  }
  renderLedgerDetail(ledger);
}

function renderLedgerDetail(ledger) {
  if (ledgerDetailTitle) ledgerDetailTitle.textContent = ledger.customerName;

  const entries = ledger.entries || [];
  const entryRows = entries.length
    ? entries.map((e) => {
        const signed = e.entryType === "debit" ? `+${fmtMoney(e.amount)}` : `− ${fmtMoney(e.amount)}`;
        const label = LEDGER_SOURCE_LABELS[e.source] || e.source;
        const due = e.dueDate ? ` · due ${new Date(e.dueDate).toLocaleDateString()}` : "";
        const detail = e.note || e.referenceLabel || label;
        return `
        <tr>
          <td>${new Date(e.createdAt).toLocaleDateString()}<div class="muted tiny">${escHtml(detail)}${due}</div></td>
          <td class="${e.entryType === "debit" ? "neg" : "pos"}">${signed}</td>
          <td>${fmtMoney(e.balanceAfter)}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="3" class="muted tiny">No ledger activity yet.</td></tr>`;

  const reminders = ledger.reminders || [];
  const reminderRows = reminders.length
    ? reminders.map((r) => `
        <li>
          <span class="status-badge sent">${REMINDER_CHANNEL_LABELS[r.channel] || r.channel}</span>
          <span class="muted tiny">${new Date(r.createdAt).toLocaleString()} · balance ${fmtMoney(r.balanceAtReminder)}</span>
          ${r.note ? `<div class="tiny">${escHtml(r.note)}</div>` : ""}
        </li>`).join("")
    : `<li class="muted tiny">No reminders logged yet.</li>`;

  ledgerDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Balance</span><span>${balanceSummaryLine(ledger.balance)}</span></div>
      ${ledger.overdue ? `<div class="info-row"><span class="label">Status</span><span class="status-badge out_of_stock">Overdue ${overdueDaysLabel(ledger.oldestOverdueDate)}</span></div>` : ""}
      ${ledger.phone ? `<div class="info-row"><span class="label">Phone</span>${escHtml(ledger.phone)}</div>` : ""}
    </div>

    <div class="inv-adjust">
      <h4>Record a transaction</h4>
      <div class="ledger-entry-row">
        <input class="inv-delta" id="ledgerAmountInput" type="number" min="0" step="0.01" placeholder="Amount ₹" />
        <input class="inv-reason" id="ledgerNoteInput" type="text" placeholder="Note (optional)" />
        <input class="ledger-due" id="ledgerDueInput" type="date" title="Due date (charges)" />
      </div>
      <div class="ledger-entry-actions">
        <button type="button" class="button tiny primary" id="ledgerPaymentBtn">Record payment</button>
        <button type="button" class="button tiny ghost" id="ledgerChargeBtn">Add charge</button>
      </div>
    </div>

    <div class="inv-adjust">
      <h4>Log a reminder</h4>
      <div class="ledger-entry-row">
        <select class="crm-search" id="ledgerChannelSelect" style="flex:0 0 auto;">
          <option value="whatsapp">WhatsApp</option>
          <option value="call">Call</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="manual">Other</option>
        </select>
        <input class="inv-reason" id="ledgerReminderNote" type="text" placeholder="Reminder note (optional)" />
        <button type="button" class="button tiny ghost" id="ledgerReminderBtn">Log reminder</button>
      </div>
    </div>

    <h4 class="section-label">Statement</h4>
    <table class="inv-movements">
      <thead><tr><th>When</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${entryRows}</tbody>
    </table>

    <h4 class="section-label">Reminders</h4>
    <ul class="ledger-reminders">${reminderRows}</ul>`;

  document.getElementById("ledgerPaymentBtn")?.addEventListener("click", () => addLedgerEntry(ledger.customerId, "credit"));
  document.getElementById("ledgerChargeBtn")?.addEventListener("click", () => addLedgerEntry(ledger.customerId, "debit"));
  document.getElementById("ledgerReminderBtn")?.addEventListener("click", () => logLedgerReminder(ledger.customerId));
}

async function addLedgerEntry(customerId, entryType) {
  const amount = Number(document.getElementById("ledgerAmountInput")?.value);
  const note = (document.getElementById("ledgerNoteInput")?.value || "").trim();
  const dueDate = document.getElementById("ledgerDueInput")?.value || null;
  if (!amount || amount <= 0) { showTransientToast("Enter an amount greater than zero."); return; }

  const body = { entryType, amount, note, source: entryType === "credit" ? "payment" : "manual" };
  if (entryType === "debit" && dueDate) body.dueDate = dueDate;

  const { error } = await apiRequest("POST", `/api/ledger/customers/${customerId}/entries`, body);
  if (error) { showTransientToast(error); return; }
  showTransientToast(entryType === "credit" ? "Payment recorded." : "Charge added.");
  renderLedgerSummary();
  openLedgerDetail(customerId);
}

async function logLedgerReminder(customerId) {
  const channel = document.getElementById("ledgerChannelSelect")?.value || "manual";
  const note = (document.getElementById("ledgerReminderNote")?.value || "").trim();
  const { error } = await apiRequest("POST", `/api/ledger/customers/${customerId}/reminders`, { channel, note });
  if (error) { showTransientToast(error); return; }
  showTransientToast("Reminder logged.");
  openLedgerDetail(customerId);
}

function closeLedgerDetail() {
  if (ledgerDetailModal) ledgerDetailModal.classList.add("hidden");
  currentLedgerCustomerId = null;
  // Refresh the list so updated balances / reminder dates show immediately.
  if (ledgerModal && !ledgerModal.classList.contains("hidden")) renderLedgerList();
}

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
if (customersBtn) customersBtn.addEventListener("click", openCustomersModal);
if (closeCustomersBtn) closeCustomersBtn.addEventListener("click", closeCustomersModal);
if (closeCustomers2Btn) closeCustomers2Btn.addEventListener("click", closeCustomersModal);
if (newCustomerBtn) newCustomerBtn.addEventListener("click", openNewCustomerModal);
if (closeNewCustomerBtn) closeNewCustomerBtn.addEventListener("click", closeNewCustomerModal);
if (cancelNewCustomerBtn) cancelNewCustomerBtn.addEventListener("click", closeNewCustomerModal);
if (newCustomerForm) newCustomerForm.addEventListener("submit", handleNewCustomerSubmit);
if (closeCustomerDetailBtn) closeCustomerDetailBtn.addEventListener("click", closeCustomerDetail);
if (closeCustomerDetail2Btn) closeCustomerDetail2Btn.addEventListener("click", closeCustomerDetail);
if (addSiteBtn) addSiteBtn.addEventListener("click", openSiteModal);
if (editCustomerBtn) editCustomerBtn.addEventListener("click", editCurrentCustomer);
if (deleteCustomerBtn) deleteCustomerBtn.addEventListener("click", deleteCurrentCustomer);
if (siteForm) siteForm.addEventListener("submit", handleSiteSubmit);
if (closeSiteBtn) closeSiteBtn.addEventListener("click", closeSiteModal);
if (cancelSiteBtn) cancelSiteBtn.addEventListener("click", closeSiteModal);
if (customerSearchInput) {
  customerSearchInput.addEventListener("input", () => {
    renderCustomersList(customerSearchInput.value.trim());
  });
}
if (leadCustomerSelect) {
  leadCustomerSelect.addEventListener("change", () => {
    populateLeadSites(leadCustomerSelect.value);
  });
}

// Phase 6: Quotes & Orders
if (quotesBtn) quotesBtn.addEventListener("click", openQuotesModal);
if (closeQuotesBtn) closeQuotesBtn.addEventListener("click", closeQuotesModal);
if (closeQuotes2Btn) closeQuotes2Btn.addEventListener("click", closeQuotesModal);
if (quotesTabBtn) quotesTabBtn.addEventListener("click", () => switchCommerceTab("quotes"));
if (ordersTabBtn) ordersTabBtn.addEventListener("click", () => switchCommerceTab("orders"));
if (docStatusFilter) docStatusFilter.addEventListener("change", renderDocList);
if (newQuoteBtn) newQuoteBtn.addEventListener("click", () => openQuoteForm());
if (quoteForm) quoteForm.addEventListener("submit", handleQuoteSubmit);
if (closeQuoteFormBtn) closeQuoteFormBtn.addEventListener("click", closeQuoteForm);
if (cancelQuoteFormBtn) cancelQuoteFormBtn.addEventListener("click", closeQuoteForm);
if (addQuoteItemBtn) addQuoteItemBtn.addEventListener("click", () => { addQuoteItemRow(blankItem()); recomputeQuoteTotals(); });
if (quoteShadePicker) quoteShadePicker.addEventListener("change", onShadePicked);
if (quoteCustomerSelect) quoteCustomerSelect.addEventListener("change", () => populateQuoteSites(quoteCustomerSelect.value));
if (quoteDiscount) quoteDiscount.addEventListener("input", recomputeQuoteTotals);
if (quoteTaxRate) quoteTaxRate.addEventListener("input", recomputeQuoteTotals);
if (closeDocDetailBtn) closeDocDetailBtn.addEventListener("click", closeDocDetail);

// Phase 6: Inventory
if (inventoryBtn) inventoryBtn.addEventListener("click", openInventoryModal);
if (closeInventoryBtn) closeInventoryBtn.addEventListener("click", closeInventoryModal);
if (closeInventory2Btn) closeInventory2Btn.addEventListener("click", closeInventoryModal);
if (newInventoryBtn) newInventoryBtn.addEventListener("click", () => openInventoryForm());
if (inventoryForm) inventoryForm.addEventListener("submit", handleInventorySubmit);
if (closeInventoryFormBtn) closeInventoryFormBtn.addEventListener("click", closeInventoryForm);
if (cancelInventoryFormBtn) cancelInventoryFormBtn.addEventListener("click", closeInventoryForm);
if (closeInventoryDetailBtn) closeInventoryDetailBtn.addEventListener("click", closeInventoryDetail);
if (closeInventoryDetail2Btn) closeInventoryDetail2Btn.addEventListener("click", closeInventoryDetail);
if (editInventoryBtn) editInventoryBtn.addEventListener("click", editCurrentInventory);
if (deleteInventoryBtn) deleteInventoryBtn.addEventListener("click", deleteCurrentInventory);
if (inventorySearchInput) inventorySearchInput.addEventListener("input", renderInventoryList);
if (inventoryStatusFilter) inventoryStatusFilter.addEventListener("change", renderInventoryList);
if (invShadePicker) {
  invShadePicker.addEventListener("change", () => {
    const opt = invShadePicker.selectedOptions[0];
    if (!opt || !opt.value) return;
    const nameEl = document.getElementById("invName");
    const brandEl = document.getElementById("invBrand");
    const priceEl = document.getElementById("invUnitPrice");
    if (nameEl && !nameEl.value) nameEl.value = opt.dataset.name || "";
    if (brandEl && !brandEl.value) brandEl.value = opt.dataset.brand || "";
    if (priceEl && (!priceEl.value || priceEl.value === "0")) priceEl.value = opt.dataset.price || "0";
  });
}

// Phase 6: Credit Ledger
if (ledgerBtn) ledgerBtn.addEventListener("click", openLedgerModal);
if (closeLedgerBtn) closeLedgerBtn.addEventListener("click", closeLedgerModal);
if (closeLedger2Btn) closeLedger2Btn.addEventListener("click", closeLedgerModal);
if (closeLedgerDetailBtn) closeLedgerDetailBtn.addEventListener("click", closeLedgerDetail);
if (closeLedgerDetail2Btn) closeLedgerDetail2Btn.addEventListener("click", closeLedgerDetail);
if (ledgerSearchInput) ledgerSearchInput.addEventListener("input", renderLedgerList);
if (ledgerFilter) ledgerFilter.addEventListener("change", renderLedgerList);

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
      if (m === docDetailModal) currentDoc = null;
      if (m === inventoryDetailModal) { currentInventoryId = null; currentInventoryObj = null; }
      if (m === ledgerDetailModal) currentLedgerCustomerId = null;
    }
  });
});

// Escape key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (ledgerDetailModal && !ledgerDetailModal.classList.contains("hidden")) {
      closeLedgerDetail();
      return;
    }
    if (ledgerModal && !ledgerModal.classList.contains("hidden")) {
      closeLedgerModal();
      return;
    }
    if (inventoryDetailModal && !inventoryDetailModal.classList.contains("hidden")) {
      closeInventoryDetail();
      return;
    }
    if (inventoryFormModal && !inventoryFormModal.classList.contains("hidden")) {
      closeInventoryForm();
      return;
    }
    if (inventoryModal && !inventoryModal.classList.contains("hidden")) {
      closeInventoryModal();
      return;
    }
    if (docDetailModal && !docDetailModal.classList.contains("hidden")) {
      closeDocDetail();
      return;
    }
    if (quoteFormModal && !quoteFormModal.classList.contains("hidden")) {
      closeQuoteForm();
      return;
    }
    if (quotesModal && !quotesModal.classList.contains("hidden")) {
      closeQuotesModal();
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
