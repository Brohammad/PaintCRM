import { test, expect } from '@playwright/test';
import { uniqueEmail } from '../helpers/auth.js';

test.describe('password reset UI', () => {
  test('forgot password form shows success message', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#forgotLink').click();
    await expect(page.locator('#forgotForm')).toBeVisible();
    await expect(page.locator('#forgotEmail')).toBeVisible();

    await page.locator('#forgotEmail').fill(uniqueEmail('forgot'));
    await page.locator('#forgotBtn').click();

    const message = page.locator('#message.success');
    await expect(message).toBeVisible();
    await expect(message).toContainText(/reset instructions/i);
  });
});
