// Pure presentation/formatting helpers shared across the UI. Kept free of DOM
// and network access so they are trivially unit-testable.

// Escapes a value for safe interpolation into innerHTML.
export function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Rupee money formatting with two decimals.
export function fmtMoney(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Rounds to 2 decimal places, avoiding binary float drift.
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
