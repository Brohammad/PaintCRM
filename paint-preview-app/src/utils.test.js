import { describe, it, expect } from 'vitest';
import { escHtml, fmtMoney, round2 } from './utils.js';

describe('escHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(escHtml("O'Brien & Co")).toBe('O&#39;Brien &amp; Co');
  });

  it('renders null/undefined as an empty string', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(escHtml(42)).toBe('42');
  });
});

describe('fmtMoney', () => {
  it('formats numbers as rupees with two decimals', () => {
    expect(fmtMoney(1000)).toBe('₹1,000.00');
    expect(fmtMoney(1234.5)).toBe('₹1,234.50');
  });

  it('treats invalid input as zero', () => {
    expect(fmtMoney('abc')).toBe('₹0.00');
    expect(fmtMoney(null)).toBe('₹0.00');
  });
});

describe('round2', () => {
  it('rounds to two decimals without float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
  });
});
