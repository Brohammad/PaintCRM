const request = require('supertest');
const app = require('../app');

describe('Credit Ledger API', () => {
  let token;
  let customerId;

  async function auth() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        shopName: 'Ledger Shop',
        email: `ledger-${Date.now()}-${Math.random()}@shop.com`,
        password: 'password123',
      });
    return res.body.token;
  }

  async function createCustomer(t = token, name = 'Ledger Customer', phone = '555-9090') {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${t}`)
      .send({ name, phone });
    return res.body.customer.id;
  }

  function postEntry(id, body) {
    return request(app)
      .post(`/api/ledger/customers/${id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function createOrder(body) {
    return request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  const sampleItems = [{ description: 'Emulsion 20L', quantity: 10, unitPrice: 500 }];

  beforeEach(async () => {
    await global.cleanDatabase();
    token = await auth();
    customerId = await createCustomer();
  });

  it('records a debit and a credit with a running balance', async () => {
    const debit = await postEntry(customerId, { entryType: 'debit', amount: 1000, note: 'Manual charge' });
    expect(debit.status).toBe(201);
    expect(debit.body.entry.balanceAfter).toBe(1000);
    expect(debit.body.ledger.balance).toBe(1000);

    const credit = await postEntry(customerId, { entryType: 'credit', amount: 400, source: 'payment', note: 'Cash' });
    expect(credit.status).toBe(201);
    expect(credit.body.entry.balanceAfter).toBe(600);
    expect(credit.body.ledger.balance).toBe(600);
    expect(credit.body.ledger.entries).toHaveLength(2);
  });

  it('rejects an invalid entry type and non-positive amount', async () => {
    const badType = await postEntry(customerId, { entryType: 'nope', amount: 100 });
    expect(badType.status).toBe(400);

    const badAmount = await postEntry(customerId, { entryType: 'debit', amount: 0 });
    expect(badAmount.status).toBe(400);

    const negAmount = await postEntry(customerId, { entryType: 'credit', amount: -5 });
    expect(negAmount.status).toBe(400);
  });

  it('404s posting to an unknown customer', async () => {
    const res = await postEntry('00000000-0000-4000-8000-000000000000', { entryType: 'debit', amount: 100 });
    expect(res.status).toBe(404);
  });

  it('posts an order total as a debit to the customer ledger', async () => {
    const order = await createOrder({ customerId, items: sampleItems, taxRate: 10 });
    expect(order.status).toBe(201);
    // subtotal 5000 + 10% tax = 5500
    expect(order.body.order.total).toBe(5500);

    const ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.ledger.balance).toBe(5500);
    const orderEntry = ledger.body.ledger.entries.find((e) => e.source === 'order');
    expect(orderEntry).toBeTruthy();
    expect(orderEntry.entryType).toBe('debit');
    expect(orderEntry.amount).toBe(5500);
    expect(orderEntry.referenceLabel).toMatch(/^O-\d{4}$/);
  });

  it('applies a payment against an order balance', async () => {
    await createOrder({ customerId, items: sampleItems }); // 5000
    const pay = await postEntry(customerId, { entryType: 'credit', amount: 2000, source: 'payment' });
    expect(pay.body.ledger.balance).toBe(3000);
  });

  it('reverses the ledger posting when an order is deleted', async () => {
    const order = await createOrder({ customerId, items: sampleItems }); // 5000
    const orderId = order.body.order.id;

    let ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.body.ledger.balance).toBe(5000);

    const del = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.body.ledger.balance).toBe(0);
    // Original debit + reversing credit both remain for the audit trail.
    const reversal = ledger.body.ledger.entries.find((e) => e.source === 'reversal');
    expect(reversal).toBeTruthy();
    expect(reversal.entryType).toBe('credit');
  });

  it('flags a customer as overdue when a past-due debit is outstanding', async () => {
    await postEntry(customerId, { entryType: 'debit', amount: 1500, dueDate: '2020-01-01' });

    const ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.body.ledger.overdue).toBe(true);

    const overdueList = await request(app)
      .get('/api/ledger/customers?overdue=true')
      .set('Authorization', `Bearer ${token}`);
    expect(overdueList.body.customers).toHaveLength(1);
    expect(overdueList.body.customers[0].overdue).toBe(true);
  });

  it('does not flag overdue once the balance is cleared', async () => {
    await postEntry(customerId, { entryType: 'debit', amount: 1000, dueDate: '2020-01-01' });
    await postEntry(customerId, { entryType: 'credit', amount: 1000, source: 'payment' });

    const ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.body.ledger.balance).toBe(0);
    expect(ledger.body.ledger.overdue).toBe(false);
  });

  it('lists only customers who owe money', async () => {
    const paidCustomer = await createCustomer(token, 'Paid Up', '555-1111');
    await postEntry(customerId, { entryType: 'debit', amount: 800 });
    // paidCustomer has no ledger activity and should not appear.

    const list = await request(app)
      .get('/api/ledger/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.customers).toHaveLength(1);
    expect(list.body.customers[0].customerId).toBe(customerId);
    expect(list.body.customers[0].balance).toBe(800);
    expect(paidCustomer).toBeTruthy();
  });

  it('summarizes tenant-wide receivables and overdue amounts', async () => {
    const other = await createCustomer(token, 'Second Debtor', '555-2222');
    await postEntry(customerId, { entryType: 'debit', amount: 1000, dueDate: '2020-01-01' }); // overdue
    await postEntry(other, { entryType: 'debit', amount: 500 }); // not overdue (no due date)

    const res = await request(app)
      .get('/api/ledger/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.receivable).toBe(1500);
    expect(res.body.summary.debtors).toBe(2);
    expect(res.body.summary.overdueCustomers).toBe(1);
    expect(res.body.summary.overdueAmount).toBe(1000);
  });

  it('logs a payment reminder with a balance snapshot', async () => {
    await postEntry(customerId, { entryType: 'debit', amount: 1200 });

    const reminder = await request(app)
      .post(`/api/ledger/customers/${customerId}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'whatsapp', note: 'Sent gentle reminder' });
    expect(reminder.status).toBe(201);
    expect(reminder.body.reminder.channel).toBe('whatsapp');
    expect(reminder.body.reminder.balanceAtReminder).toBe(1200);

    const ledger = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ledger.body.ledger.reminders).toHaveLength(1);
    expect(ledger.body.ledger.reminders[0].note).toBe('Sent gentle reminder');
  });

  it('sends a WhatsApp reminder and returns a click-to-chat link', async () => {
    await postEntry(customerId, { entryType: 'debit', amount: 800, dueDate: '2020-01-01' });

    const res = await request(app)
      .post(`/api/ledger/customers/${customerId}/reminders/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'whatsapp' });
    expect(res.status).toBe(201);
    expect(res.body.delivery.method).toBe('click_to_chat');
    expect(res.body.delivery.url).toMatch(/^https:\/\/wa\.me\//);
    expect(res.body.reminder.channel).toBe('whatsapp');
    expect(res.body.message).toMatch(/outstanding/i);
  });

  it('rejects send when the customer has no phone', async () => {
    const noPhone = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Phone Customer', phone: '555-0001' });
    const { pool } = require('../lib/db');
    await pool.query('UPDATE customers SET phone = $1 WHERE id = $2', ['', noPhone.body.customer.id]);
    await postEntry(noPhone.body.customer.id, { entryType: 'debit', amount: 100 });

    const res = await request(app)
      .post(`/api/ledger/customers/${noPhone.body.customer.id}/reminders/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'whatsapp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it('run-overdue skips WhatsApp when MSG91 is not configured', async () => {
    const past = '2020-01-01';
    await postEntry(customerId, { entryType: 'debit', amount: 500, dueDate: past });

    const res = await request(app)
      .post('/api/ledger/reminders/run-overdue')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Without MSG91, automated cron must not pretend WhatsApp click-to-chat was "sent".
    expect(res.body.result.sent).toBe(0);
    expect(res.body.result.skipped).toBeGreaterThan(0);
    expect(res.body.result.results?.[0]?.error).toBe('cron_requires_sms');
  });

  it('rejects an invalid reminder channel', async () => {
    const res = await request(app)
      .post(`/api/ledger/customers/${customerId}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'pigeon' });
    expect(res.status).toBe(400);
  });

  it('isolates ledgers between tenants', async () => {
    await postEntry(customerId, { entryType: 'debit', amount: 999 });
    const otherToken = await auth();
    const res = await request(app)
      .get(`/api/ledger/customers/${customerId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/ledger/summary');
    expect(res.status).toBe(401);
  });
});
