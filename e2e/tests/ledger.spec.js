import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';

test.describe('ledger', () => {
  test('signed-in user can open credit ledger modal', async ({ page }) => {
    await registerDealer(page);

    await page.locator('#ledgerBtn').click();
    await expect(page.locator('#ledgerModal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Credit Ledger' })).toBeVisible();
    await expect(page.locator('#ledgerPanel')).toBeVisible();
    await expect(page.locator('#ledgerSignInPrompt')).toBeHidden();

    await page.locator('#closeLedger2Btn').click();
    await expect(page.locator('#ledgerModal')).toBeHidden();
  });
});
