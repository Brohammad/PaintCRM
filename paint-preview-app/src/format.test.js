import { describe, it, expect } from 'vitest';
import { statusBadge, overdueDaysLabel, balanceSummaryLine } from './format.js';

describe('statusBadge', () => {
  const labels = { draft: 'Draft', paid: 'Paid' };

  it('renders a pill with the mapped label', () => {
    expect(statusBadge('paid', labels)).toBe('<span class="status-badge paid">Paid</span>');
  });

  it('falls back to the raw status when unmapped', () => {
    expect(statusBadge('archived', labels)).toBe(
      '<span class="status-badge archived">archived</span>',
    );
  });
});

describe('overdueDaysLabel', () => {
  const now = new Date('2026-01-10T00:00:00Z').getTime();

  it('returns an empty string for a missing date', () => {
    expect(overdueDaysLabel('', now)).toBe('');
    expect(overdueDaysLabel(null, now)).toBe('');
  });

  it('returns an empty string for a future due date', () => {
    expect(overdueDaysLabel('2026-01-20T00:00:00Z', now)).toBe('');
  });

  it('reports whole days overdue', () => {
    expect(overdueDaysLabel('2026-01-05T00:00:00Z', now)).toBe('5d');
  });
});

describe('balanceSummaryLine', () => {
  it('describes an outstanding balance', () => {
    expect(balanceSummaryLine(1500)).toBe(
      '<strong class="ledger-owes">₹1,500.00</strong> outstanding',
    );
  });

  it('describes a credit balance using the absolute value', () => {
    expect(balanceSummaryLine(-250)).toBe(
      '<strong class="ledger-credit">₹250.00</strong> in credit',
    );
  });

  it('treats a near-zero balance as settled', () => {
    expect(balanceSummaryLine(0)).toBe('<strong>Settled</strong>');
    expect(balanceSummaryLine(0.004)).toBe('<strong>Settled</strong>');
  });
});
