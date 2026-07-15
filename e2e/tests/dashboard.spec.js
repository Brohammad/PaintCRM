import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';

test.describe('dashboard / analytics smoke', () => {
  test('Pilot Analytics and Settings modals open and close', async ({ page }) => {
    await registerDealer(page);

    await page.locator('#leadsBtn').click();
    await expect(page.locator('#leadsModal')).toBeVisible();
    await page.locator('#analyticsTabBtn').click();
    await expect(page.locator('#analyticsPanel')).toBeVisible();
    await page.locator('#closeLeadsBtn').click();
    await expect(page.locator('#leadsModal')).toBeHidden();

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dealer Settings' })).toBeVisible();
    await page.locator('#closeSettingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeHidden();
  });
});
