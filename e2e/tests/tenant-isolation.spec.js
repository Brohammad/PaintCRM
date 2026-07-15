import { test, expect } from '@playwright/test';
import { registerDealer, uniqueEmail } from '../helpers/auth.js';
import { createCustomer, expectNoCustomerMatch } from '../helpers/app.js';

test.describe('tenant isolation', () => {
  test('dealer B cannot see dealer A customer in UI search', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const customerName = `Isolated Customer ${Date.now()}`;
    const customerPhone = `6${String(Date.now()).slice(-9)}`;

    const emailA = uniqueEmail('tenant-a');
    await registerDealer(pageA, { shopName: 'Tenant A Shop', email: emailA });
    await createCustomer(pageA, { name: customerName, phone: customerPhone });

    const emailB = uniqueEmail('tenant-b');
    await registerDealer(pageB, { shopName: 'Tenant B Shop', email: emailB });
    await expectNoCustomerMatch(pageB, customerName);

    await contextA.close();
    await contextB.close();
  });
});
