import { test, expect } from '@playwright/test';
import { registerDealer } from '../helpers/auth.js';
import { createCustomer, searchCustomer } from '../helpers/app.js';

test.describe('customers', () => {
  test('create customer and find via search', async ({ page }) => {
    await registerDealer(page);

    const name = `Customer ${Date.now()}`;
    const phone = `8${String(Date.now()).slice(-9)}`;

    await createCustomer(page, { name, phone });

    const found = await searchCustomer(page, name);
    expect(found.some((n) => n.includes(name))).toBe(true);
  });
});
