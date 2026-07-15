// Scheduled overdue payment reminders. SMS sends when MSG91 is configured;
// WhatsApp automated delivery requires a provider API — manual send uses wa.me.

const { query } = require('../lib/db');
const { listBalances, sendReminder } = require('../lib/ledger');

function cooldownDays() {
  return Math.max(1, Number(process.env.REMINDER_COOLDOWN_DAYS) || 7);
}

// Automated cron only makes sense for true outbound delivery (SMS via MSG91).
// WhatsApp click-to-chat cannot be "sent" unattended — never use it as cron default.
function defaultChannel() {
  if (process.env.MSG91_AUTH_KEY) return 'sms';
  return null;
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

async function runOverdueRemindersForTenant(tenantId, shopName, { channel = defaultChannel() } = {}) {
  const cooldown = cooldownDays();
  const summary = { tenantId, sent: 0, skipped: 0, errors: 0, results: [] };

  // Refuse unattended WhatsApp — wa.me links need a human. Manual send API still works.
  if (!channel || channel === 'whatsapp') {
    summary.skipped = 1;
    summary.results.push({
      error: 'cron_requires_sms',
      detail: 'Set MSG91_AUTH_KEY to enable automated overdue SMS. WhatsApp remains manual (click-to-chat).',
    });
    return summary;
  }

  let offset = 0;
  const limit = 50;

  while (true) {
    const { rows, total } = await listBalances(tenantId, { overdueOnly: true, limit, offset });
    for (const row of rows) {
      if (!row.phone) {
        summary.skipped += 1;
        continue;
      }
      if (daysSince(row.lastReminderAt) < cooldown) {
        summary.skipped += 1;
        continue;
      }

      try {
        const result = await sendReminder(tenantId, row.customerId, {
          channel,
          note: 'Automated overdue reminder',
          shopName,
        });
        if (result.notFound || result.noPhone) {
          summary.skipped += 1;
          continue;
        }
        // Only count true provider delivery — never click-to-chat links.
        if (result.delivery?.sent) summary.sent += 1;
        else summary.skipped += 1;
        summary.results.push({
          customerId: row.customerId,
          customerName: row.customerName,
          delivery: result.delivery,
        });
      } catch (err) {
        summary.errors += 1;
        summary.results.push({
          customerId: row.customerId,
          customerName: row.customerName,
          error: err.message,
        });
      }
    }

    offset += limit;
    if (offset >= total || rows.length === 0) break;
  }

  return summary;
}

async function runOverdueReminderJob() {
  if (process.env.ENABLE_REMINDER_CRON !== 'true') {
    return { enabled: false, skipped: true };
  }

  const tenants = await query('SELECT id, shop_name FROM tenants');
  const totals = { enabled: true, sent: 0, skipped: 0, errors: 0, tenants: [] };

  for (const tenant of tenants.rows) {
    const result = await runOverdueRemindersForTenant(tenant.id, tenant.shop_name);
    totals.sent += result.sent;
    totals.skipped += result.skipped;
    totals.errors += result.errors;
    totals.tenants.push(result);
  }

  return totals;
}

let timer = null;

function startReminderScheduler(log = console) {
  if (process.env.ENABLE_REMINDER_CRON !== 'true') return null;

  const intervalMs = Math.max(
    60_000,
    Number(process.env.REMINDER_CRON_INTERVAL_MS) || 24 * 60 * 60 * 1000,
  );

  const tick = () => {
    runOverdueReminderJob()
      .then((result) => log.info?.({ result }, 'reminder cron completed') ?? log.log('reminder cron completed', result))
      .catch((err) => log.error?.({ err }, 'reminder cron failed') ?? log.error('reminder cron failed', err));
  };

  // Run once on startup after a short delay so the pool/migrations are ready.
  setTimeout(tick, 15_000);
  timer = setInterval(tick, intervalMs);
  return timer;
}

function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  runOverdueReminderJob,
  runOverdueRemindersForTenant,
  startReminderScheduler,
  stopReminderScheduler,
};
