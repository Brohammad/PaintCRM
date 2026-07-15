import { test, expect } from '@playwright/test';
import { continueAsGuest } from '../helpers/auth.js';
import { expectAppShell } from '../helpers/app.js';

test.describe('404 / SPA fallback', () => {
  test('unknown route serves app shell without server error', async ({ page }) => {
    await continueAsGuest(page);

    const response = await page.goto('/this-page-does-not-exist');
    expect(response).not.toBeNull();
    expect(response.status()).toBe(200);
    expect(response.status()).not.toBe(500);
    await expectAppShell(page);
  });
});
