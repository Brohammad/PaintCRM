// Outbound payment reminders — SMS via MSG91 when configured; WhatsApp via API
// or a click-to-chat wa.me link when not. Keeps provider details out of ledger.js.

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// Normalises Indian mobile numbers to wa.me / MSG91 format (91XXXXXXXXXX).
function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return digits;
  return digits;
}

function formatInr(amount) {
  return round2(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReminderMessage({ shopName, customerName, balance, dueDate }) {
  const shop = (shopName || 'Your paint dealer').trim();
  const name = (customerName || 'Customer').trim();
  const due =
    dueDate && !Number.isNaN(new Date(dueDate).getTime())
      ? ` Payment was due by ${new Date(dueDate).toLocaleDateString('en-IN')}.`
      : '';
  return (
    `Hi ${name}, this is ${shop}. ` +
    `Your outstanding paint account balance is ₹${formatInr(balance)}.${due} ` +
    `Please arrange payment at your earliest convenience. Thank you!`
  );
}

function whatsAppClickToChatUrl(phone, message) {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized || normalized.length < 11) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

async function sendSmsViaMsg91(phone, message) {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) return { sent: false, reason: 'msg91_not_configured' };

  const normalized = normalizeIndianPhone(phone);
  if (!normalized || normalized.length < 11) {
    return { sent: false, reason: 'invalid_phone' };
  }

  const sender = process.env.MSG91_SENDER_ID || 'PAINTC';
  const params = new URLSearchParams({
    authkey: authKey,
    mobiles: normalized,
    message,
    sender,
    route: '4',
    country: '91',
  });

  const url = `https://api.msg91.com/api/sendhttp.php?${params.toString()}`;
  const res = await fetch(url, { method: 'GET' });
  const body = await res.text();

  if (!res.ok) {
    return { sent: false, reason: 'msg91_http_error', detail: body.slice(0, 200) };
  }

  // MSG91 returns a message id on success, error text otherwise.
  if (/error/i.test(body)) {
    return { sent: false, reason: 'msg91_rejected', detail: body.slice(0, 200) };
  }

  return { sent: true, provider: 'msg91', messageId: body.trim() };
}

const SEND_CHANNELS = new Set(['whatsapp', 'sms']);

// Attempts delivery for whatsapp/sms; other channels are log-only.
async function deliverReminder({ channel, phone, message }) {
  if (!SEND_CHANNELS.has(channel)) {
    return { channel, status: 'logged', sent: false };
  }

  if (!phone) {
    return { channel, status: 'missing_phone', sent: false };
  }

  if (channel === 'sms') {
    const sms = await sendSmsViaMsg91(phone, message);
    if (sms.sent) {
      return { channel, status: 'sent', sent: true, provider: sms.provider, messageId: sms.messageId };
    }
    return { channel, status: sms.reason, sent: false, detail: sms.detail || null };
  }

  // WhatsApp: prefer click-to-chat (works without API keys); optional MSG91 later.
  const url = whatsAppClickToChatUrl(phone, message);
  if (!url) {
    return { channel, status: 'invalid_phone', sent: false };
  }

  return {
    channel,
    status: 'ready',
    sent: false,
    method: 'click_to_chat',
    url,
    message,
  };
}

module.exports = {
  normalizeIndianPhone,
  buildReminderMessage,
  whatsAppClickToChatUrl,
  deliverReminder,
  SEND_CHANNELS,
};
