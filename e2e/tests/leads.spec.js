import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';
import { expectAppShell, uploadRoomPhoto } from '../helpers/app.js';

test.describe('lead creation', () => {
  test('signed-in user can submit Contact Dealer lead form', async ({ page }) => {
    await registerDealer(page);
    await expectAppShell(page);
    await uploadRoomPhoto(page);

    const leadName = `Lead ${Date.now()}`;
    const leadPhone = `9${String(Date.now()).slice(-9)}`;

    await page.locator('#contactBtn').click();
    await expect(page.locator('#contactModal')).toBeVisible();
    await page.locator('#leadName').fill(leadName);
    await page.locator('#leadPhone').fill(leadPhone);
    await page.locator('#contactForm button[type="submit"]').click();

    await expect(page.getByText(`Lead saved for ${leadName}.`)).toBeVisible();
    await expect(page.locator('#contactModal')).toBeHidden();

    await page.locator('#leadsBtn').click();
    await expect(page.locator('#leadsModal')).toBeVisible();
    await expect(page.locator('#leadsList')).toContainText(leadName);
    await page.locator('#closeLeads2Btn').click();
  });
});
