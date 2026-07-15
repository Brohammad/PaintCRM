import path from 'path';
import { fileURLToPath } from 'url';
import { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function expectAppShell(page) {
  await expect(page.getByRole('heading', { name: /Upload a room/i })).toBeVisible();
}

export async function uploadRoomPhoto(page) {
  const fixture = path.join(__dirname, '../fixtures/tiny-room.png');
  await page.locator('#imageInput').setInputFiles(fixture);
  await expect(page.locator('#contactBtn')).toBeEnabled({ timeout: 25_000 });
}

export async function createCustomer(page, { name, phone }) {
  await page.locator('#customersBtn').click();
  await expect(page.locator('#customersModal')).toBeVisible();
  await page.locator('#newCustomerBtn').click();
  await expect(page.locator('#newCustomerModal')).toBeVisible();
  await page.locator('#newCustomerName').fill(name);
  await page.locator('#newCustomerPhone').fill(phone);
  await page.locator('#saveCustomerBtn').click();
  await expect(page.getByText(`Customer ${name} saved.`)).toBeVisible();
  await page.locator('#closeCustomers2Btn').click();
  await expect(page.locator('#customersModal')).toBeHidden();
}

export async function searchCustomer(page, query) {
  await page.locator('#customersBtn').click();
  await expect(page.locator('#customersModal')).toBeVisible();
  await page.locator('#customerSearchInput').fill(query);
  await expect(page.locator('#customersList .customer-card').first()).toBeVisible({ timeout: 10_000 });
  const names = await page.locator('#customersList .customer-card .name').allTextContents();
  await page.locator('#closeCustomers2Btn').click();
  return names;
}

export async function expectNoCustomerMatch(page, query) {
  await page.locator('#customersBtn').click();
  await expect(page.locator('#customersModal')).toBeVisible();
  await page.locator('#customerSearchInput').fill(query);
  await expect(page.locator('#customersList .customer-card')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('#customersList')).toContainText(/No customers yet/i);
  await page.locator('#closeCustomers2Btn').click();
}
