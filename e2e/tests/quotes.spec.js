import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';
import { createCustomer } from '../helpers/app.js';

test.describe('quotes → convert', () => {
  test('create quote with line item and convert to order', async ({ page }) => {
    await registerDealer(page);

    const customerName = `Quote Customer ${Date.now()}`;
    const customerPhone = `7${String(Date.now()).slice(-9)}`;
    await createCustomer(page, { name: customerName, phone: customerPhone });

    await page.locator('#quotesBtn').click();
    await expect(page.locator('#quotesModal')).toBeVisible();
    await page.locator('#newQuoteBtn').click();
    await expect(page.locator('#quoteFormModal')).toBeVisible();

    await page.locator('#quoteCustomerSelect').selectOption({ label: `${customerName} — ${customerPhone}` });
    await page.locator('#quoteItemsList .qi-desc').first().fill('Royale Emulsion 10L');
    await page.locator('#quoteItemsList .qi-qty').first().fill('2');
    await page.locator('#quoteItemsList .qi-price').first().fill('1500');
    await page.locator('#saveQuoteBtn').click();

    await expect(page.getByText('Quote created.')).toBeVisible();
    await expect(page.locator('#quoteFormModal')).toBeHidden();
    await expect(page.locator('#docList .doc-card').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('#docList .doc-card').first().click();
    await expect(page.locator('#docDetailModal')).toBeVisible();

    const statusSelect = page.locator('#docDetailActions .doc-status-select');
    await statusSelect.selectOption('accepted');
    await expect(page.getByText('Quote status updated.')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Convert to Order' }).click();
    await expect(page.getByText(/Order .+ created\./)).toBeVisible();

    await page.locator('#ordersTabBtn').click();
    await expect(page.locator('#docList .doc-card').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('#closeQuotes2Btn').click();
  });
});
