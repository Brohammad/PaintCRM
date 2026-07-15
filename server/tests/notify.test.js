const {
  normalizeIndianPhone,
  buildReminderMessage,
  whatsAppClickToChatUrl,
  deliverReminder,
} = require('../lib/notify');

describe('notify', () => {
  describe('normalizeIndianPhone', () => {
    it('prefixes 10-digit Indian mobiles with 91', () => {
      expect(normalizeIndianPhone('9876543210')).toBe('919876543210');
    });

    it('keeps numbers that already include the country code', () => {
      expect(normalizeIndianPhone('+91 98765 43210')).toBe('919876543210');
    });
  });

  describe('buildReminderMessage', () => {
    it('includes shop name, customer name, and formatted balance', () => {
      const msg = buildReminderMessage({
        shopName: 'Kerala Paints',
        customerName: 'Ravi',
        balance: 1500,
        dueDate: '2026-01-05',
      });
      expect(msg).toMatch(/Kerala Paints/);
      expect(msg).toMatch(/Ravi/);
      expect(msg).toMatch(/1,500\.00/);
    });
  });

  describe('whatsAppClickToChatUrl', () => {
    it('builds a wa.me link with encoded text', () => {
      const url = whatsAppClickToChatUrl('9876543210', 'Hello there');
      expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(url).toContain(encodeURIComponent('Hello there'));
    });
  });

  describe('deliverReminder', () => {
    const oldKey = process.env.MSG91_AUTH_KEY;
    afterEach(() => {
      process.env.MSG91_AUTH_KEY = oldKey;
    });

    it('returns a WhatsApp click-to-chat payload', async () => {
      const result = await deliverReminder({
        channel: 'whatsapp',
        phone: '9876543210',
        message: 'Pay please',
      });
      expect(result.method).toBe('click_to_chat');
      expect(result.url).toMatch(/^https:\/\/wa\.me\//);
    });

    it('reports missing MSG91 config for SMS', async () => {
      delete process.env.MSG91_AUTH_KEY;
      const result = await deliverReminder({
        channel: 'sms',
        phone: '9876543210',
        message: 'Pay please',
      });
      expect(result.sent).toBe(false);
      expect(result.status).toBe('msg91_not_configured');
    });

    it('logs non-send channels without delivery', async () => {
      const result = await deliverReminder({ channel: 'call', phone: '9876543210', message: 'x' });
      expect(result.status).toBe('logged');
    });
  });
});
