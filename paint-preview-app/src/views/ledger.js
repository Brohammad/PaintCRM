import { showTransientToast } from '../app/toast.js';
import { createPaginator, withPageParams } from '../pagination.js';
import { escHtml, fmtMoney } from '../utils.js';
import { balanceSummaryLine, overdueDaysLabel } from '../format.js';

const LEDGER_SOURCE_LABELS = {
  order: 'Order',
  payment: 'Payment',
  manual: 'Manual',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
};

const REMINDER_CHANNEL_LABELS = {
  manual: 'Logged',
  call: 'Call',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
};

// Factory keeps DOM refs injected from script.js while moving ledger logic out
// of the monolith. Returns public handlers + a wireListeners() for startup.
export function createLedgerView({ els, apiRequest, getApiToken }) {
  let currentLedgerCustomerId = null;
  const ledgerPaginator = createPaginator();

  function openLedgerModal() {
    if (!els.ledgerModal) return;
    const signedIn = !!getApiToken();
    if (els.ledgerSignInPrompt) els.ledgerSignInPrompt.style.display = signedIn ? 'none' : 'block';
    if (els.ledgerPanel) els.ledgerPanel.style.display = signedIn ? 'block' : 'none';
    els.ledgerModal.classList.remove('hidden');
    if (signedIn) {
      renderLedgerSummary();
      renderLedgerList();
    }
  }

  function closeLedgerModal() {
    if (els.ledgerModal) els.ledgerModal.classList.add('hidden');
  }

  async function renderLedgerSummary() {
    if (!els.ledgerSummary) return;
    const { data, error } = await apiRequest('GET', '/api/ledger/summary');
    if (error || !data?.summary) {
      els.ledgerSummary.innerHTML = '';
      return;
    }
    const s = data.summary;
    els.ledgerSummary.innerHTML = `
    <div class="inv-chip"><div class="n">${fmtMoney(s.receivable)}</div><div class="l">Receivable</div></div>
    <div class="inv-chip out"><div class="n">${fmtMoney(s.overdueAmount)}</div><div class="l">Overdue</div></div>
    <div class="inv-chip"><div class="n">${s.debtors}</div><div class="l">Owe you</div></div>
    <div class="inv-chip low"><div class="n">${s.overdueCustomers}</div><div class="l">Overdue</div></div>`;
  }

  function ledgerListQuery() {
    const q = (els.ledgerSearchInput?.value || '').trim();
    const overdue = els.ledgerFilter?.value === 'overdue';
    const params = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (overdue) params.push('overdue=true');
    let path = '/api/ledger/customers';
    if (params.length) path += `?${params.join('&')}`;
    return path;
  }

  async function renderLedgerList() {
    if (!els.ledgerList) return;
    ledgerPaginator.reset();
    els.ledgerList.innerHTML = `<p class="muted tiny">Loading…</p>`;
    await fetchLedgerPage(false);
  }

  async function loadMoreLedger() {
    await fetchLedgerPage(true);
  }

  async function fetchLedgerPage(append) {
    if (!els.ledgerList) return;
    const path = withPageParams(ledgerListQuery(), ledgerPaginator.params());
    const { data, error } = await apiRequest('GET', path);
    const oldBtn = els.ledgerList.querySelector('.load-more-row');
    if (oldBtn) oldBtn.remove();
    if (error) {
      if (!append) els.ledgerList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`;
      return;
    }
    const customers = data?.customers || [];
    ledgerPaginator.absorb(data?.pagination);
    if (!append) els.ledgerList.innerHTML = '';
    if (!customers.length && !append) {
      const q = (els.ledgerSearchInput?.value || '').trim();
      const overdue = els.ledgerFilter?.value === 'overdue';
      els.ledgerList.innerHTML = `<p class="muted" style="padding:12px;">${
        overdue || q ? 'No accounts match this filter.' : 'No outstanding balances. Order totals post here automatically.'
      }</p>`;
      return;
    }
    customers.forEach((c) => els.ledgerList.appendChild(ledgerCard(c)));
    if (ledgerPaginator.hasMore) els.ledgerList.appendChild(ledgerLoadMoreRow());
  }

  function ledgerLoadMoreRow() {
    const row = document.createElement('div');
    row.className = 'load-more-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button ghost';
    const remaining = Math.max(0, ledgerPaginator.total - ledgerPaginator.offset);
    btn.textContent = remaining > 0 ? `Load more (${remaining} more)` : 'Load more';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      loadMoreLedger();
    });
    row.appendChild(btn);
    return row;
  }

  function ledgerCard(c) {
    const card = document.createElement('div');
    card.className = 'inv-card' + (c.overdue ? ' out' : '');
    const overdueTag = c.overdue
      ? `<span class="status-badge out_of_stock">Overdue ${overdueDaysLabel(c.oldestOverdueDate)}</span>`
      : '';
    const reminded = c.lastReminderAt
      ? ` · reminded ${new Date(c.lastReminderAt).toLocaleDateString()}`
      : '';
    card.innerHTML = `
    <div>
      <div class="name">${escHtml(c.customerName)}</div>
      <div class="meta">${escHtml(c.phone || '')}${reminded} ${overdueTag}</div>
    </div>
    <div class="qty">${fmtMoney(c.balance)}<small>owes</small></div>`;
    card.addEventListener('click', () => openLedgerDetail(c.customerId));
    return card;
  }

  async function openLedgerDetail(customerId) {
    if (!els.ledgerDetailModal || !els.ledgerDetailBody) return;
    currentLedgerCustomerId = customerId;
    els.ledgerDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
    els.ledgerDetailModal.classList.remove('hidden');

    const { data, error } = await apiRequest('GET', `/api/ledger/customers/${customerId}`);
    const ledger = data?.ledger;
    if (error || !ledger) {
      els.ledgerDetailBody.innerHTML = `<p class="muted">${escHtml(error || 'Not found.')}</p>`;
      return;
    }
    renderLedgerDetail(ledger);
  }

  function renderLedgerDetail(ledger) {
    if (els.ledgerDetailTitle) els.ledgerDetailTitle.textContent = ledger.customerName;

    const entries = ledger.entries || [];
    const entryRows = entries.length
      ? entries.map((e) => {
          const signed = e.entryType === 'debit' ? `+${fmtMoney(e.amount)}` : `− ${fmtMoney(e.amount)}`;
          const label = LEDGER_SOURCE_LABELS[e.source] || e.source;
          const due = e.dueDate ? ` · due ${new Date(e.dueDate).toLocaleDateString()}` : '';
          const detail = e.note || e.referenceLabel || label;
          return `
        <tr>
          <td>${new Date(e.createdAt).toLocaleDateString()}<div class="muted tiny">${escHtml(detail)}${due}</div></td>
          <td class="${e.entryType === 'debit' ? 'neg' : 'pos'}">${signed}</td>
          <td>${fmtMoney(e.balanceAfter)}</td>
        </tr>`;
        }).join('')
      : `<tr><td colspan="3" class="muted tiny">No ledger activity yet.</td></tr>`;

    const reminders = ledger.reminders || [];
    const reminderRows = reminders.length
      ? reminders.map((r) => `
        <li>
          <span class="status-badge sent">${REMINDER_CHANNEL_LABELS[r.channel] || r.channel}</span>
          <span class="muted tiny">${new Date(r.createdAt).toLocaleString()} · balance ${fmtMoney(r.balanceAtReminder)}</span>
          ${r.note ? `<div class="tiny">${escHtml(r.note)}</div>` : ''}
        </li>`).join('')
      : `<li class="muted tiny">No reminders logged yet.</li>`;

    els.ledgerDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Balance</span><span>${balanceSummaryLine(ledger.balance)}</span></div>
      ${ledger.overdue ? `<div class="info-row"><span class="label">Status</span><span class="status-badge out_of_stock">Overdue ${overdueDaysLabel(ledger.oldestOverdueDate)}</span></div>` : ''}
      ${ledger.phone ? `<div class="info-row"><span class="label">Phone</span>${escHtml(ledger.phone)}</div>` : ''}
    </div>

    <div class="inv-adjust">
      <h4>Record a transaction</h4>
      <div class="ledger-entry-row">
        <input class="inv-delta" id="ledgerAmountInput" type="number" min="0" step="0.01" placeholder="Amount ₹" />
        <input class="inv-reason" id="ledgerNoteInput" type="text" placeholder="Note (optional)" />
        <input class="ledger-due" id="ledgerDueInput" type="date" title="Due date (charges)" />
      </div>
      <div class="ledger-entry-actions">
        <button type="button" class="button tiny primary" id="ledgerPaymentBtn">Record payment</button>
        <button type="button" class="button tiny ghost" id="ledgerChargeBtn">Add charge</button>
      </div>
    </div>

    <div class="inv-adjust">
      <h4>Send a reminder</h4>
      <div class="ledger-entry-row">
        <select class="crm-search" id="ledgerChannelSelect" style="flex:0 0 auto;">
          <option value="whatsapp">WhatsApp (opens chat)</option>
          <option value="sms">SMS (needs MSG91 on server)</option>
          <option value="call">Call (log only)</option>
          <option value="email">Email (log only)</option>
          <option value="manual">Other (log only)</option>
        </select>
        <input class="inv-reason" id="ledgerReminderNote" type="text" placeholder="Note (optional)" />
        <button type="button" class="button tiny primary" id="ledgerReminderBtn">Send reminder</button>
      </div>
      <p class="muted tiny">WhatsApp opens a pre-filled chat on this device. SMS only delivers when the server has MSG91_AUTH_KEY. Call/Email/Other are logged for follow-up — they do not send messages.</p>
    </div>

    <h4 class="section-label">Statement</h4>
    <table class="inv-movements">
      <thead><tr><th>When</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${entryRows}</tbody>
    </table>

    <h4 class="section-label">Reminders</h4>
    <ul class="ledger-reminders">${reminderRows}</ul>`;

    document.getElementById('ledgerPaymentBtn')?.addEventListener('click', () => addLedgerEntry(ledger.customerId, 'credit'));
    document.getElementById('ledgerChargeBtn')?.addEventListener('click', () => addLedgerEntry(ledger.customerId, 'debit'));
    document.getElementById('ledgerReminderBtn')?.addEventListener('click', () => sendLedgerReminder(ledger.customerId));
  }

  async function addLedgerEntry(customerId, entryType) {
    const amount = Number(document.getElementById('ledgerAmountInput')?.value);
    const note = (document.getElementById('ledgerNoteInput')?.value || '').trim();
    const dueDate = document.getElementById('ledgerDueInput')?.value || null;
    if (!amount || amount <= 0) {
      showTransientToast('Enter an amount greater than zero.');
      return;
    }

    const body = { entryType, amount, note, source: entryType === 'credit' ? 'payment' : 'manual' };
    if (entryType === 'debit' && dueDate) body.dueDate = dueDate;

    const { error } = await apiRequest('POST', `/api/ledger/customers/${customerId}/entries`, body);
    if (error) {
      showTransientToast(error);
      return;
    }
    showTransientToast(entryType === 'credit' ? 'Payment recorded.' : 'Charge added.');
    renderLedgerSummary();
    openLedgerDetail(customerId);
  }

  async function sendLedgerReminder(customerId) {
    const channel = document.getElementById('ledgerChannelSelect')?.value || 'whatsapp';
    const note = (document.getElementById('ledgerReminderNote')?.value || '').trim();

    if (channel === 'whatsapp' || channel === 'sms') {
      const { data, error } = await apiRequest(
        'POST',
        `/api/ledger/customers/${customerId}/reminders/send`,
        { channel, note },
      );
      if (error) {
        showTransientToast(error);
        return;
      }

      if (data?.delivery?.url) {
        window.open(data.delivery.url, '_blank', 'noopener,noreferrer');
        showTransientToast(
          channel === 'sms' && data.delivery.sent
            ? 'SMS sent.'
            : 'WhatsApp chat opened with reminder text.',
        );
      } else if (data?.delivery?.sent) {
        showTransientToast('Reminder sent.');
      } else {
        showTransientToast(
          data?.delivery?.status === 'msg91_not_configured'
            ? 'SMS not configured on server — set MSG91_AUTH_KEY.'
            : 'Reminder logged.',
        );
      }
      openLedgerDetail(customerId);
      return;
    }

    const { error } = await apiRequest('POST', `/api/ledger/customers/${customerId}/reminders`, { channel, note });
    if (error) {
      showTransientToast(error);
      return;
    }
    showTransientToast('Reminder logged.');
    openLedgerDetail(customerId);
  }

  function closeLedgerDetail() {
    if (els.ledgerDetailModal) els.ledgerDetailModal.classList.add('hidden');
    currentLedgerCustomerId = null;
    if (els.ledgerModal && !els.ledgerModal.classList.contains('hidden')) renderLedgerList();
  }

  function wireListeners() {
    if (els.ledgerBtn) els.ledgerBtn.addEventListener('click', openLedgerModal);
    if (els.closeLedgerBtn) els.closeLedgerBtn.addEventListener('click', closeLedgerModal);
    if (els.closeLedger2Btn) els.closeLedger2Btn.addEventListener('click', closeLedgerModal);
    if (els.closeLedgerDetailBtn) els.closeLedgerDetailBtn.addEventListener('click', closeLedgerDetail);
    if (els.closeLedgerDetail2Btn) els.closeLedgerDetail2Btn.addEventListener('click', closeLedgerDetail);
    if (els.ledgerSearchInput) els.ledgerSearchInput.addEventListener('input', renderLedgerList);
    if (els.ledgerFilter) els.ledgerFilter.addEventListener('change', renderLedgerList);
  }

  return {
    openLedgerModal,
    closeLedgerModal,
    closeLedgerDetail,
    openLedgerDetail,
    renderLedgerSummary,
    renderLedgerList,
    wireListeners,
    get currentLedgerCustomerId() {
      return currentLedgerCustomerId;
    },
    clearCurrentLedgerCustomer() {
      currentLedgerCustomerId = null;
    },
  };
}
