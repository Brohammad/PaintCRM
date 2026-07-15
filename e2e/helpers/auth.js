import { expect } from '@playwright/test';

export const DEFAULT_PASSWORD = 'Testpass1';

/** Unique email for deterministic, collision-free test accounts. */
export function uniqueEmail(prefix = 'e2e') {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@e2e.paintcrm.test`;
}

export async function registerDealer(page, {
  shopName = 'E2E Paint Shop',
  dealerName = 'E2E Tester',
  phone = '+91 9000000001',
  email = uniqueEmail(),
  password = DEFAULT_PASSWORD,
} = {}) {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.locator('#regShopName').fill(shopName);
  await page.locator('#regDealerName').fill(dealerName);
  await page.locator('#regPhone').fill(phone);
  await page.locator('#regEmail').fill(email);
  await page.locator('#regPassword').fill(password);
  await page.locator('#registerBtn').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
  return { shopName, dealerName, phone, email, password };
}

export async function loginDealer(page, { email, password = DEFAULT_PASSWORD }) {
  await page.goto('/login');
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginBtn').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

export async function continueAsGuest(page) {
  await page.goto('/login');
  await page.locator('#guestLink').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

export async function logoutViaSettings(page) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#serverLogoutBtn')).toBeVisible({ timeout: 10_000 });
  await page.locator('#serverLogoutBtn').click();
  await page.waitForURL('**/login**', { timeout: 15_000 });
}
