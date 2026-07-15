const { runOverdueRemindersForTenant } = require('../jobs/reminders');

describe('reminder cron job policy', () => {
  const prevKey = process.env.MSG91_AUTH_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.MSG91_AUTH_KEY;
    else process.env.MSG91_AUTH_KEY = prevKey;
  });

  it('refuses unattended WhatsApp / missing SMS provider without touching the DB', async () => {
    delete process.env.MSG91_AUTH_KEY;
    const summary = await runOverdueRemindersForTenant('tenant-x', 'Demo Shop');
    expect(summary.sent).toBe(0);
    expect(summary.results[0].error).toBe('cron_requires_sms');
  });
});
