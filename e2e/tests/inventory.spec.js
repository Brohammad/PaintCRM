import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';

test.describe('inventory', () => {
  test('create inventory item and find via search', async ({ page }) => {
    await registerDealer(page);

    const itemName = `Inventory ${Date.now()}`;

    await page.locator('#inventoryBtn').click();
    await expect(page.locator('#inventoryModal')).toBeVisible();
    await page.locator('#newInventoryBtn').click();
    await expect(page.locator('#inventoryFormModal')).toBeVisible();

    await page.locator('#invName').fill(itemName);
    await page.locator('#invBrand').fill('Asian Paints');
    await page.locator('#invSku').fill(`SKU-${Date.now()}`);
    await page.locator('#invQuantity').fill('12');
    await page.locator('#saveInventoryBtn').click();

    await expect(page.getByText('Item added.')).toBeVisible();
    await expect(page.locator('#inventoryFormModal')).toBeHidden();

    await page.locator('#inventorySearchInput').fill(itemName);
    await expect(page.locator('#inventoryList .inv-card .name').first()).toContainText(itemName);
    await page.locator('#closeInventory2Btn').click();
  });
});
