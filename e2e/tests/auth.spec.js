import { test, expect } from '@playwright/test';
import { registerDealer, loginDealer, logoutViaSettings, DEFAULT_PASSWORD } from '../helpers/auth.js';
import { expectAppShell } from '../helpers/app.js';

test.describe('auth', () => {
  test('register lands in app, login works, logout returns to login', async ({ page }) => {
    const creds = await registerDealer(page, { shopName: 'Auth E2E Shop' });
    await expectAppShell(page);

    await logoutViaSettings(page);
    await expect(page).toHaveURL(/\/login/);

    await loginDealer(page, creds);
    await expectAppShell(page);
    await expect(page.locator('#settingsBtn')).toBeVisible();
  });
});
