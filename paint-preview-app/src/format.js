// Small pure presentation helpers for the CRM/commerce/ledger views. They build
// HTML fragments or short labels from domain values and contain no DOM access,
// so they're safe to unit-test.

import { fmtMoney } from './utils.js';

// Renders a coloured status pill. `labels` maps a status key to a display label;
// unknown statuses fall back to the raw key.
export function statusBadge(status, labels) {
  return `<span class="status-badge ${status}">${labels[status] || status}</span>`;
}

// Returns a short "Nd" overdue label for a due date in the past, or '' when the
// date is empty or not yet overdue. `now` is injectable for testing.
export function overdueDaysLabel(dateStr, now = Date.now()) {
  if (!dateStr) return '';
  const due = new Date(dateStr);
  const days = Math.floor((now - due.getTime()) / 86400000);
  return days > 0 ? `${days}d` : '';
}

// Describes a customer's credit-ledger balance: a positive balance is money the
// customer owes, negative is store credit, near-zero is settled.
export function balanceSummaryLine(balance) {
  if (balance > 0.005) return `<strong class="ledger-owes">${fmtMoney(balance)}</strong> outstanding`;
  if (balance < -0.005) return `<strong class="ledger-credit">${fmtMoney(-balance)}</strong> in credit`;
  return `<strong>Settled</strong>`;
}
