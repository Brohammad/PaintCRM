import { showTransientToast } from '../app/toast.js';
import { escHtml, fmtMoney, round2 } from '../utils.js';
import { statusBadge } from '../format.js';

const QUOTE_STATUS_LABELS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', converted: 'Converted' };
const ORDER_STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };
const QUOTE_ALL_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'converted'];
const CLIENT_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected'];
const ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'];

export function createQuotesView({
  els,
  apiRequest,
  getApiToken,
  fetchCustomers,
  getCatalog,
  roomSqM,
  coverageSqMPerL,
  onQuoteCreated,
}) {
  let commerceTab = 'quotes';
  let editingQuoteId = null;
  let currentDoc = null;

  function blankItem() {
    return { description: '', brand: '', quantity: 1, unitPrice: 0, unit: 'litre', shadeId: '' };
  }

  function openQuotesModal() {
    if (!els.quotesModal) return;
    const signedIn = !!getApiToken();
    if (els.quotesSignInPrompt) els.quotesSignInPrompt.style.display = signedIn ? 'none' : 'block';
    if (els.quotesPanel) els.quotesPanel.style.display = signedIn ? 'block' : 'none';
    els.quotesModal.classList.remove('hidden');
    if (signedIn) switchCommerceTab(commerceTab);
  }

  function closeQuotesModal() {
    if (els.quotesModal) els.quotesModal.classList.add('hidden');
  }

  function switchCommerceTab(tab) {
    commerceTab = tab;
    if (els.quotesTabBtn) els.quotesTabBtn.classList.toggle('active', tab === 'quotes');
    if (els.ordersTabBtn) els.ordersTabBtn.classList.toggle('active', tab === 'orders');
    if (els.newQuoteBtn) els.newQuoteBtn.style.display = tab === 'quotes' ? '' : 'none';
    buildStatusFilter();
    renderDocList();
  }

  function buildStatusFilter() {
    if (!els.docStatusFilter) return;
    const statuses = commerceTab === 'quotes' ? QUOTE_ALL_STATUSES : ORDER_STATUSES;
    const labels = commerceTab === 'quotes' ? QUOTE_STATUS_LABELS : ORDER_STATUS_LABELS;
    els.docStatusFilter.innerHTML =
      `<option value="">All statuses</option>` +
      statuses.map((s) => `<option value="${s}">${labels[s]}</option>`).join('');
  }

  async function renderDocList() {
    if (!els.docList) return;
    els.docList.innerHTML = `<p class="muted tiny">Loading…</p>`;
    const status = els.docStatusFilter?.value || '';
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';

    if (commerceTab === 'quotes') {
      const { data, error } = await apiRequest('GET', `/api/quotes${qs}`);
      if (error) { els.docList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
      const quotes = data?.quotes || [];
      if (!quotes.length) {
        els.docList.innerHTML = `<p class="muted" style="padding:12px;">No quotes yet. Tap + New Quote.</p>`;
        return;
      }
      els.docList.innerHTML = '';
      quotes.forEach((q) => els.docList.appendChild(docCard({
        number: q.quoteNumber,
        sub: `${escHtml(q.customerName || '—')}${q.siteName ? ' · ' + escHtml(q.siteName) : ''} · ${q.itemCount || 0} items`,
        total: q.total,
        status: q.status,
        labels: QUOTE_STATUS_LABELS,
        onClick: () => openDocDetail('quote', q.id),
      })));
    } else {
      const { data, error } = await apiRequest('GET', `/api/orders${qs}`);
      if (error) { els.docList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
      const orders = data?.orders || [];
      if (!orders.length) {
        els.docList.innerHTML = `<p class="muted" style="padding:12px;">No orders yet. Convert an accepted quote to create one.</p>`;
        return;
      }
      els.docList.innerHTML = '';
      orders.forEach((o) => els.docList.appendChild(docCard({
        number: o.orderNumber,
        sub: `${escHtml(o.customerName || '—')}${o.quoteNumber ? ' · from ' + escHtml(o.quoteNumber) : ''} · ${o.itemCount || 0} items`,
        total: o.total,
        status: o.status,
        labels: ORDER_STATUS_LABELS,
        onClick: () => openDocDetail('order', o.id),
      })));
    }
  }

  function docCard({ number, sub, total, status, labels, onClick }) {
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.innerHTML = `
    <div>
      <div class="doc-number">${escHtml(number)}</div>
      <div class="doc-sub">${sub}</div>
    </div>
    <div class="doc-right">
      <div class="doc-total">${fmtMoney(total)}</div>
      ${statusBadge(status, labels)}
    </div>`;
    card.addEventListener('click', onClick);
    return card;
  }

  async function openQuoteForm(quote = null) {
    if (!els.quoteFormModal) return;
    editingQuoteId = quote?.id || null;
    if (els.quoteFormTitle) els.quoteFormTitle.textContent = quote ? `Edit ${quote.quoteNumber}` : 'New Quote';
    if (els.saveQuoteBtn) els.saveQuoteBtn.textContent = quote ? 'Update Quote' : 'Save Quote';
    if (els.quoteFormError) els.quoteFormError.textContent = '';

    populateShadePicker();
    await populateQuoteCustomers(quote?.customerId);
    await populateQuoteSites(quote?.customerId, quote?.siteId);

    if (els.quoteDiscount) els.quoteDiscount.value = quote?.discount ?? 0;
    if (els.quoteTaxRate) els.quoteTaxRate.value = quote?.taxRate ?? 0;
    if (els.quoteNotes) els.quoteNotes.value = quote?.notes || '';

    els.quoteItemsList.innerHTML = '';
    const items = quote?.items?.length ? quote.items : [blankItem()];
    items.forEach(addQuoteItemRow);
    recomputeQuoteTotals();
    els.quoteFormModal.classList.remove('hidden');
  }

  function closeQuoteForm() {
    if (els.quoteFormModal) els.quoteFormModal.classList.add('hidden');
    editingQuoteId = null;
  }

  async function populateQuoteCustomers(selectedId) {
    const customers = await fetchCustomers();
    els.quoteCustomerSelect.innerHTML =
      `<option value="">Select customer…</option>` +
      customers.map((c) => `<option value="${c.id}">${escHtml(c.name)} — ${escHtml(c.phone)}</option>`).join('');
    if (selectedId) els.quoteCustomerSelect.value = selectedId;
  }

  async function populateQuoteSites(customerId, selectedId) {
    els.quoteSiteSelect.innerHTML = `<option value="">No site</option>`;
    if (!customerId) return;
    const { data } = await apiRequest('GET', `/api/sites?customerId=${encodeURIComponent(customerId)}`);
    (data?.sites || []).forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      els.quoteSiteSelect.appendChild(opt);
    });
    if (selectedId) els.quoteSiteSelect.value = selectedId;
  }

  function populateShadePicker() {
    if (!els.quoteShadePicker) return;
    const cat = Array.isArray(getCatalog()) ? getCatalog() : [];
    els.quoteShadePicker.innerHTML =
      `<option value="">Add a shade from the catalog…</option>` +
      cat.map((s, i) =>
        `<option value="${i}">${escHtml(s.name)}${s.brand ? ' — ' + escHtml(s.brand) : ''}${s.pricePerL ? ` (₹${s.pricePerL}/L)` : ''}</option>`
      ).join('');
  }

  function onShadePicked() {
    const idx = els.quoteShadePicker.value;
    if (idx === '') return;
    const catalog = getCatalog();
    const s = catalog[Number(idx)];
    if (s) {
      const litres = Math.ceil((roomSqM * 2) / coverageSqMPerL);
      addQuoteItemRow({
        description: s.brand ? `${s.name} (${s.brand})` : s.name,
        brand: s.brand || '',
        quantity: litres,
        unitPrice: s.pricePerL || 0,
        unit: 'litre',
        shadeId: s.id || '',
      });
      recomputeQuoteTotals();
    }
    els.quoteShadePicker.value = '';
  }

  function addQuoteItemRow(item) {
    const row = document.createElement('div');
    row.className = 'quote-item-row';
    row.dataset.shadeId = item.shadeId || '';
    const qty = item.quantity ?? 1;
    const price = item.unitPrice ?? 0;
    row.innerHTML = `
    <div class="qi-desc-wrap">
      <input class="qi-desc" type="text" placeholder="Description" value="${escHtml(item.description)}" />
      <input class="qi-brand" type="text" placeholder="Brand (optional)" value="${escHtml(item.brand || '')}" />
    </div>
    <input class="qi-qty" type="number" min="0" step="0.01" value="${qty}" />
    <input class="qi-price" type="number" min="0" step="0.01" value="${price}" />
    <div class="qi-line">${fmtMoney((Number(qty) || 0) * (Number(price) || 0))}</div>
    <button type="button" class="qi-remove" title="Remove line">×</button>`;
    row.querySelector('.qi-remove').addEventListener('click', () => {
      row.remove();
      ensureAtLeastOneRow();
      recomputeQuoteTotals();
    });
    row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', recomputeQuoteTotals));
    els.quoteItemsList.appendChild(row);
  }

  function ensureAtLeastOneRow() {
    if (els.quoteItemsList && els.quoteItemsList.querySelectorAll('.quote-item-row').length === 0) {
      addQuoteItemRow(blankItem());
    }
  }

  function recomputeQuoteTotals() {
    if (!els.quoteItemsList || !els.quoteTotals) return;
    let subtotal = 0;
    els.quoteItemsList.querySelectorAll('.quote-item-row').forEach((row) => {
      const qty = Number(row.querySelector('.qi-qty').value) || 0;
      const price = Number(row.querySelector('.qi-price').value) || 0;
      const line = round2(qty * price);
      row.querySelector('.qi-line').textContent = fmtMoney(line);
      subtotal += line;
    });
    subtotal = round2(subtotal);
    const discount = Number(els.quoteDiscount?.value) || 0;
    const taxRate = Number(els.quoteTaxRate?.value) || 0;
    const base = Math.max(0, round2(subtotal - discount));
    const tax = round2((base * taxRate) / 100);
    const total = round2(base + tax);
    els.quoteTotals.innerHTML = `
    <div class="t-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
    <div class="t-row"><span>Discount</span><span>− ${fmtMoney(discount)}</span></div>
    <div class="t-row"><span>Tax (${taxRate}%)</span><span>${fmtMoney(tax)}</span></div>
    <div class="t-row grand"><span>Total</span><span>${fmtMoney(total)}</span></div>`;
  }

  function collectQuoteItems() {
    return [...els.quoteItemsList.querySelectorAll('.quote-item-row')]
      .map((row, i) => ({
        shadeId: row.dataset.shadeId || '',
        description: row.querySelector('.qi-desc').value.trim(),
        brand: row.querySelector('.qi-brand').value.trim(),
        quantity: Number(row.querySelector('.qi-qty').value) || 0,
        unitPrice: Number(row.querySelector('.qi-price').value) || 0,
        unit: 'litre',
        sortOrder: i,
      }))
      .filter((it) => it.description);
  }

  async function handleQuoteSubmit(e) {
    e.preventDefault();
    const customerId = els.quoteCustomerSelect.value;
    if (!customerId) { els.quoteFormError.textContent = 'Select a customer.'; return; }
    const items = collectQuoteItems();
    if (!items.length) { els.quoteFormError.textContent = 'Add at least one line item with a description.'; return; }

    const payload = {
      customerId,
      siteId: els.quoteSiteSelect.value || null,
      discount: Number(els.quoteDiscount.value) || 0,
      taxRate: Number(els.quoteTaxRate.value) || 0,
      notes: els.quoteNotes.value.trim(),
      items,
    };

    if (els.saveQuoteBtn) els.saveQuoteBtn.disabled = true;
    const { error } = editingQuoteId
      ? await apiRequest('PUT', `/api/quotes/${editingQuoteId}`, payload)
      : await apiRequest('POST', '/api/quotes', payload);
    if (els.saveQuoteBtn) els.saveQuoteBtn.disabled = false;

    if (error) { els.quoteFormError.textContent = error; return; }
    const wasEditing = editingQuoteId;
    closeQuoteForm();
    showTransientToast(wasEditing ? 'Quote updated.' : 'Quote created.');
    if (!wasEditing) onQuoteCreated?.();
    commerceTab = 'quotes';
    if (els.docStatusFilter) els.docStatusFilter.value = '';
    buildStatusFilter();
    renderDocList();
  }

  async function openDocDetail(type, id) {
    if (!els.docDetailModal || !els.docDetailBody) return;
    els.docDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
    if (els.docDetailActions) els.docDetailActions.innerHTML = '';
    els.docDetailModal.classList.remove('hidden');

    const path = type === 'quote' ? `/api/quotes/${id}` : `/api/orders/${id}`;
    const { data, error } = await apiRequest('GET', path);
    const doc = type === 'quote' ? data?.quote : data?.order;
    if (error || !doc) {
      els.docDetailBody.innerHTML = `<p class="muted">${escHtml(error || 'Not found.')}</p>`;
      return;
    }
    currentDoc = { type, data: doc };
    renderDocDetail(type, doc);
  }

  function closeDocDetail() {
    if (els.docDetailModal) els.docDetailModal.classList.add('hidden');
    currentDoc = null;
  }

  function renderDocDetail(type, doc) {
    const isQuote = type === 'quote';
    const number = isQuote ? doc.quoteNumber : doc.orderNumber;
    const labels = isQuote ? QUOTE_STATUS_LABELS : ORDER_STATUS_LABELS;
    if (els.docDetailTitle) els.docDetailTitle.textContent = number;

    const itemRows = (doc.items || []).map((it) => `
    <tr>
      <td>${escHtml(it.description)}${it.brand ? `<div class="muted tiny">${escHtml(it.brand)}</div>` : ''}</td>
      <td>${it.quantity}</td>
      <td>${fmtMoney(it.unitPrice)}</td>
      <td>${fmtMoney(it.lineTotal)}</td>
    </tr>`).join('');

    els.docDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Status</span>${statusBadge(doc.status, labels)}</div>
      <div class="info-row"><span class="label">Customer</span><strong>${escHtml(doc.customerName || '—')}</strong></div>
      ${doc.siteName ? `<div class="info-row"><span class="label">Site</span>${escHtml(doc.siteName)}</div>` : ''}
      ${!isQuote && doc.quoteNumber ? `<div class="info-row"><span class="label">From quote</span>${escHtml(doc.quoteNumber)}</div>` : ''}
      ${doc.notes ? `<div class="info-row"><span class="label">Notes</span>${escHtml(doc.notes)}</div>` : ''}
    </div>
    <table class="doc-detail-items">
      <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="quote-totals">
      <div class="t-row"><span>Subtotal</span><span>${fmtMoney(doc.subtotal)}</span></div>
      <div class="t-row"><span>Discount</span><span>− ${fmtMoney(doc.discount)}</span></div>
      <div class="t-row"><span>Tax (${doc.taxRate}%)</span><span>${fmtMoney(doc.taxAmount)}</span></div>
      <div class="t-row grand"><span>Total</span><span>${fmtMoney(doc.total)}</span></div>
    </div>`;

    renderDocActions(type, doc);
  }

  function actionBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderDocActions(type, doc) {
    if (!els.docDetailActions) return;
    els.docDetailActions.innerHTML = '';

    if (type === 'quote' && doc.status !== 'converted') {
      const sel = document.createElement('select');
      sel.className = 'doc-status-select';
      sel.innerHTML = CLIENT_QUOTE_STATUSES
        .map((s) => `<option value="${s}" ${s === doc.status ? 'selected' : ''}>${QUOTE_STATUS_LABELS[s]}</option>`)
        .join('');
      sel.addEventListener('change', () => updateDocStatus('quote', doc.id, sel.value));
      els.docDetailActions.appendChild(sel);
      els.docDetailActions.appendChild(actionBtn('Delete', 'button ghost danger', () => deleteDoc('quote', doc.id)));
      els.docDetailActions.appendChild(actionBtn('Edit', 'button ghost', () => editQuote(doc)));
      els.docDetailActions.appendChild(actionBtn('Convert to Order', 'button primary', () => convertQuote(doc.id)));
      return;
    }

    if (type === 'quote') {
      const note = document.createElement('span');
      note.className = 'muted tiny';
      note.style.marginRight = 'auto';
      note.textContent = 'Converted to an order.';
      els.docDetailActions.appendChild(note);
      els.docDetailActions.appendChild(actionBtn('Delete', 'button ghost danger', () => deleteDoc('quote', doc.id)));
      els.docDetailActions.appendChild(actionBtn('Done', 'button primary', closeDocDetail));
      return;
    }

    const sel = document.createElement('select');
    sel.className = 'doc-status-select';
    sel.innerHTML = ORDER_STATUSES
      .map((s) => `<option value="${s}" ${s === doc.status ? 'selected' : ''}>${ORDER_STATUS_LABELS[s]}</option>`)
      .join('');
    sel.addEventListener('change', () => updateDocStatus('order', doc.id, sel.value));
    els.docDetailActions.appendChild(sel);
    els.docDetailActions.appendChild(actionBtn('Delete', 'button ghost danger', () => deleteDoc('order', doc.id)));
    els.docDetailActions.appendChild(actionBtn('Done', 'button primary', closeDocDetail));
  }

  async function updateDocStatus(type, id, status) {
    const path = type === 'quote' ? `/api/quotes/${id}/status` : `/api/orders/${id}/status`;
    const { error } = await apiRequest('PATCH', path, { status });
    if (error) { showTransientToast(error); return; }
    showTransientToast(`${type === 'quote' ? 'Quote' : 'Order'} status updated.`);
    openDocDetail(type, id);
  }

  async function convertQuote(id) {
    if (!confirm('Convert this quote to an order? The quote will be locked from further edits.')) return;
    const { data, error } = await apiRequest('POST', `/api/quotes/${id}/convert`);
    if (error) { showTransientToast(error); return; }
    showTransientToast(`Order ${data.order.orderNumber} created.`);
    closeDocDetail();
    commerceTab = 'orders';
    if (els.docStatusFilter) els.docStatusFilter.value = '';
    openQuotesModal();
  }

  async function deleteDoc(type, id) {
    const label = type === 'quote' ? 'quote' : 'order';
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    const path = type === 'quote' ? `/api/quotes/${id}` : `/api/orders/${id}`;
    const { error } = await apiRequest('DELETE', path);
    if (error) { showTransientToast(error); return; }
    showTransientToast(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
    closeDocDetail();
    renderDocList();
  }

  function editQuote(doc) {
    closeDocDetail();
    openQuoteForm(doc);
  }

  function wireListeners() {
    if (els.quotesBtn) els.quotesBtn.addEventListener('click', openQuotesModal);
    if (els.closeQuotesBtn) els.closeQuotesBtn.addEventListener('click', closeQuotesModal);
    if (els.closeQuotes2Btn) els.closeQuotes2Btn.addEventListener('click', closeQuotesModal);
    if (els.quotesTabBtn) els.quotesTabBtn.addEventListener('click', () => switchCommerceTab('quotes'));
    if (els.ordersTabBtn) els.ordersTabBtn.addEventListener('click', () => switchCommerceTab('orders'));
    if (els.docStatusFilter) els.docStatusFilter.addEventListener('change', renderDocList);
    if (els.newQuoteBtn) els.newQuoteBtn.addEventListener('click', () => openQuoteForm());
    if (els.quoteForm) els.quoteForm.addEventListener('submit', handleQuoteSubmit);
    if (els.closeQuoteFormBtn) els.closeQuoteFormBtn.addEventListener('click', closeQuoteForm);
    if (els.cancelQuoteFormBtn) els.cancelQuoteFormBtn.addEventListener('click', closeQuoteForm);
    if (els.addQuoteItemBtn) els.addQuoteItemBtn.addEventListener('click', () => { addQuoteItemRow(blankItem()); recomputeQuoteTotals(); });
    if (els.quoteShadePicker) els.quoteShadePicker.addEventListener('change', onShadePicked);
    if (els.quoteCustomerSelect) els.quoteCustomerSelect.addEventListener('change', () => populateQuoteSites(els.quoteCustomerSelect.value));
    if (els.quoteDiscount) els.quoteDiscount.addEventListener('input', recomputeQuoteTotals);
    if (els.quoteTaxRate) els.quoteTaxRate.addEventListener('input', recomputeQuoteTotals);
    if (els.closeDocDetailBtn) els.closeDocDetailBtn.addEventListener('click', closeDocDetail);
  }

  return {
    openQuotesModal,
    closeQuotesModal,
    closeQuoteForm,
    closeDocDetail,
    wireListeners,
    clearCurrentDoc() {
      currentDoc = null;
    },
  };
}
