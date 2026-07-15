import { test, expect } from '@playwright/test';
import { continueAsGuest } from '../helpers/auth.js';
import { expectAppShell } from '../helpers/app.js';

test.describe('guest mode', () => {
  test('continue without account opens the app', async ({ page }) => {
    await continueAsGuest(page);
    await expectAppShell(page);
    await expect(page.locator('#settingsBtn')).toBeVisible();
    await expect(page.locator('#customersBtn')).toBeVisible();
  });
});
