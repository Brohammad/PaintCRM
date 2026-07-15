import { showTransientToast } from '../app/toast.js';
import { escHtml, fmtMoney } from '../utils.js';
import { statusBadge } from '../format.js';

const INV_STATUS_LABELS = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' };

export function createInventoryView({
  els,
  apiRequest,
  getApiToken,
  getCatalog,
}) {
  let editingInventoryId = null;
  let currentInventoryId = null;
  let currentInventoryObj = null;

  function openInventoryModal() {
    if (!els.inventoryModal) return;
    const signedIn = !!getApiToken();
    if (els.inventorySignInPrompt) els.inventorySignInPrompt.style.display = signedIn ? 'none' : 'block';
    if (els.inventoryPanel) els.inventoryPanel.style.display = signedIn ? 'block' : 'none';
    els.inventoryModal.classList.remove('hidden');
    if (signedIn) {
      renderInventorySummary();
      renderInventoryList();
    }
  }

  function closeInventoryModal() {
    if (els.inventoryModal) els.inventoryModal.classList.add('hidden');
  }

  async function renderInventorySummary() {
    if (!els.inventorySummary) return;
    const { data, error } = await apiRequest('GET', '/api/inventory/summary');
    if (error || !data?.summary) { els.inventorySummary.innerHTML = ''; return; }
    const s = data.summary;
    els.inventorySummary.innerHTML = `
    <div class="inv-chip"><div class="n">${s.total}</div><div class="l">Items</div></div>
    <div class="inv-chip low"><div class="n">${s.lowStock}</div><div class="l">Low</div></div>
    <div class="inv-chip out"><div class="n">${s.outOfStock}</div><div class="l">Out</div></div>
    <div class="inv-chip"><div class="n">${fmtMoney(s.stockValue)}</div><div class="l">Stock value</div></div>`;
  }

  async function renderInventoryList() {
    if (!els.inventoryList) return;
    els.inventoryList.innerHTML = `<p class="muted tiny">Loading…</p>`;
    const q = (els.inventorySearchInput?.value || '').trim();
    const status = els.inventoryStatusFilter?.value || '';
    const params = [];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    const qs = params.length ? `?${params.join('&')}` : '';

    const { data, error } = await apiRequest('GET', `/api/inventory${qs}`);
    if (error) { els.inventoryList.innerHTML = `<p class="muted" style="padding:12px;">${escHtml(error)}</p>`; return; }
    const items = data?.items || [];
    if (!items.length) {
      els.inventoryList.innerHTML = `<p class="muted" style="padding:12px;">No items${q || status ? ' match this filter' : ' yet. Tap + New Item'}.</p>`;
      return;
    }
    els.inventoryList.innerHTML = '';
    items.forEach((it) => els.inventoryList.appendChild(invCard(it)));
  }

  function invCard(it) {
    const card = document.createElement('div');
    card.className = 'inv-card' + (it.status === 'low_stock' ? ' low' : it.status === 'out_of_stock' ? ' out' : '');
    card.innerHTML = `
    <div>
      <div class="name">${escHtml(it.name)}</div>
      <div class="meta">${it.brand ? escHtml(it.brand) + ' · ' : ''}${it.sku ? escHtml(it.sku) + ' · ' : ''}${statusBadge(it.status, INV_STATUS_LABELS)}</div>
    </div>
    <div class="qty">${it.quantity} <small>${escHtml(it.unit)}</small></div>`;
    card.addEventListener('click', () => openInventoryDetail(it.id));
    return card;
  }

  function populateInvShadePicker(selectedShadeId) {
    if (!els.invShadePicker) return;
    const cat = Array.isArray(getCatalog()) ? getCatalog() : [];
    els.invShadePicker.innerHTML =
      `<option value="">No linked shade</option>` +
      cat.map((s) =>
        `<option value="${escHtml(s.id || '')}" data-price="${s.pricePerL || 0}" data-brand="${escHtml(s.brand || '')}" data-name="${escHtml(s.name || '')}">${escHtml(s.name)}${s.brand ? ' — ' + escHtml(s.brand) : ''}</option>`
      ).join('');
    if (selectedShadeId) els.invShadePicker.value = selectedShadeId;
  }

  function openInventoryForm(item = null) {
    if (!els.inventoryFormModal) return;
    editingInventoryId = item?.id || null;
    if (els.inventoryFormTitle) els.inventoryFormTitle.textContent = item ? 'Edit Item' : 'New Item';
    if (els.saveInventoryBtn) els.saveInventoryBtn.textContent = item ? 'Update Item' : 'Save Item';
    if (els.inventoryFormError) els.inventoryFormError.textContent = '';

    populateInvShadePicker(item?.shadeId);
    setVal('invName', item?.name || '');
    setVal('invBrand', item?.brand || '');
    setVal('invSku', item?.sku || '');
    setVal('invUnit', item?.unit || 'litre');
    setVal('invQuantity', item?.quantity ?? 0);
    setVal('invReorder', item?.reorderLevel ?? 0);
    setVal('invUnitPrice', item?.unitPrice ?? 0);
    setVal('invCostPrice', item?.costPrice ?? 0);
    setVal('invNotes', item?.notes || '');

    if (els.invQtyField) els.invQtyField.style.display = item ? 'none' : '';

    els.inventoryFormModal.classList.remove('hidden');
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function closeInventoryForm() {
    if (els.inventoryFormModal) els.inventoryFormModal.classList.add('hidden');
    if (els.inventoryForm) els.inventoryForm.reset();
    editingInventoryId = null;
  }

  async function handleInventorySubmit(e) {
    e.preventDefault();
    const name = (document.getElementById('invName')?.value || '').trim();
    if (!name) { els.inventoryFormError.textContent = 'Product name is required.'; return; }

    const payload = {
      name,
      brand: (document.getElementById('invBrand')?.value || '').trim(),
      sku: (document.getElementById('invSku')?.value || '').trim(),
      unit: (document.getElementById('invUnit')?.value || 'litre').trim(),
      reorderLevel: Number(document.getElementById('invReorder')?.value) || 0,
      unitPrice: Number(document.getElementById('invUnitPrice')?.value) || 0,
      costPrice: Number(document.getElementById('invCostPrice')?.value) || 0,
      shadeId: els.invShadePicker?.value || '',
      notes: (document.getElementById('invNotes')?.value || '').trim(),
    };
    if (!editingInventoryId) {
      payload.quantity = Number(document.getElementById('invQuantity')?.value) || 0;
    }

    if (els.saveInventoryBtn) els.saveInventoryBtn.disabled = true;
    const { error } = editingInventoryId
      ? await apiRequest('PUT', `/api/inventory/${editingInventoryId}`, payload)
      : await apiRequest('POST', '/api/inventory', payload);
    if (els.saveInventoryBtn) els.saveInventoryBtn.disabled = false;

    if (error) { els.inventoryFormError.textContent = error; return; }
    const wasEditing = editingInventoryId;
    closeInventoryForm();
    showTransientToast(wasEditing ? 'Item updated.' : 'Item added.');
    renderInventorySummary();
    if (wasEditing && currentInventoryId === wasEditing) {
      openInventoryDetail(wasEditing);
    } else {
      renderInventoryList();
    }
  }

  async function openInventoryDetail(id) {
    if (!els.inventoryDetailModal || !els.inventoryDetailBody) return;
    currentInventoryId = id;
    els.inventoryDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
    els.inventoryDetailModal.classList.remove('hidden');

    const { data, error } = await apiRequest('GET', `/api/inventory/${id}`);
    const item = data?.item;
    if (error || !item) {
      els.inventoryDetailBody.innerHTML = `<p class="muted">${escHtml(error || 'Not found.')}</p>`;
      return;
    }
    currentInventoryObj = item;
    renderInventoryDetail(item);
  }

  function renderInventoryDetail(item) {
    if (els.inventoryDetailTitle) els.inventoryDetailTitle.textContent = item.name;
    const movements = item.movements || [];
    const movementRows = movements.length
      ? movements.map((m) => `
        <tr>
          <td>${new Date(m.createdAt).toLocaleString()}${m.reason ? `<div class="muted tiny">${escHtml(m.reason)}</div>` : ''}</td>
          <td class="${m.delta >= 0 ? 'pos' : 'neg'}">${m.delta >= 0 ? '+' : ''}${m.delta}</td>
          <td>${m.balanceAfter}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" class="muted tiny">No movements yet.</td></tr>`;

    els.inventoryDetailBody.innerHTML = `
    <div class="info">
      <div class="info-row"><span class="label">Status</span>${statusBadge(item.status, INV_STATUS_LABELS)}</div>
      <div class="info-row"><span class="label">On hand</span><strong>${item.quantity} ${escHtml(item.unit)}</strong></div>
      <div class="info-row"><span class="label">Reorder level</span>${item.reorderLevel} ${escHtml(item.unit)}</div>
      ${item.brand ? `<div class="info-row"><span class="label">Brand</span>${escHtml(item.brand)}</div>` : ''}
      ${item.sku ? `<div class="info-row"><span class="label">SKU</span>${escHtml(item.sku)}</div>` : ''}
      <div class="info-row"><span class="label">Selling</span>${fmtMoney(item.unitPrice)}</div>
      <div class="info-row"><span class="label">Cost</span>${fmtMoney(item.costPrice)}</div>
      ${item.notes ? `<div class="info-row"><span class="label">Notes</span>${escHtml(item.notes)}</div>` : ''}
    </div>
    <div class="inv-adjust">
      <h4>Adjust stock</h4>
      <div class="inv-adjust-row">
        <button type="button" class="button tiny ghost" id="invReceiveBtn">Receive</button>
        <button type="button" class="button tiny ghost" id="invIssueBtn">Issue</button>
        <input class="inv-delta" id="invDeltaInput" type="number" step="0.01" placeholder="± qty" />
        <input class="inv-reason" id="invReasonInput" type="text" placeholder="Reason (optional)" />
        <button type="button" class="button tiny primary" id="invApplyBtn">Apply</button>
      </div>
    </div>
    <h4 class="section-label">Recent movements</h4>
    <table class="inv-movements">
      <thead><tr><th>When</th><th>Change</th><th>Balance</th></tr></thead>
      <tbody>${movementRows}</tbody>
    </table>`;

    const deltaInput = document.getElementById('invDeltaInput');
    document.getElementById('invReceiveBtn')?.addEventListener('click', () => {
      const v = Math.abs(Number(deltaInput.value) || 0);
      deltaInput.value = v || '';
      deltaInput.focus();
    });
    document.getElementById('invIssueBtn')?.addEventListener('click', () => {
      const v = Math.abs(Number(deltaInput.value) || 0);
      deltaInput.value = v ? -v : '';
      deltaInput.focus();
    });
    document.getElementById('invApplyBtn')?.addEventListener('click', () => applyInventoryAdjust(item.id));
  }

  async function applyInventoryAdjust(id) {
    const delta = Number(document.getElementById('invDeltaInput')?.value);
    const reason = (document.getElementById('invReasonInput')?.value || '').trim();
    if (!delta) { showTransientToast('Enter a non-zero quantity change.'); return; }
    const { error } = await apiRequest('POST', `/api/inventory/${id}/adjust`, { delta, reason });
    if (error) { showTransientToast(error); return; }
    showTransientToast('Stock updated.');
    renderInventorySummary();
    openInventoryDetail(id);
  }

  function closeInventoryDetail() {
    if (els.inventoryDetailModal) els.inventoryDetailModal.classList.add('hidden');
    currentInventoryId = null;
    currentInventoryObj = null;
  }

  function editCurrentInventory() {
    if (currentInventoryObj) {
      closeInventoryDetail();
      openInventoryForm(currentInventoryObj);
    }
  }

  async function deleteCurrentInventory() {
    if (!currentInventoryId) return;
    const name = currentInventoryObj?.name || 'this item';
    if (!confirm(`Delete ${name}? Its stock history will be removed.`)) return;
    const { error } = await apiRequest('DELETE', `/api/inventory/${currentInventoryId}`);
    if (error) { showTransientToast(error); return; }
    showTransientToast('Item deleted.');
    closeInventoryDetail();
    renderInventorySummary();
    renderInventoryList();
  }

  function wireListeners() {
    if (els.inventoryBtn) els.inventoryBtn.addEventListener('click', openInventoryModal);
    if (els.closeInventoryBtn) els.closeInventoryBtn.addEventListener('click', closeInventoryModal);
    if (els.closeInventory2Btn) els.closeInventory2Btn.addEventListener('click', closeInventoryModal);
    if (els.newInventoryBtn) els.newInventoryBtn.addEventListener('click', () => openInventoryForm());
    if (els.inventoryForm) els.inventoryForm.addEventListener('submit', handleInventorySubmit);
    if (els.closeInventoryFormBtn) els.closeInventoryFormBtn.addEventListener('click', closeInventoryForm);
    if (els.cancelInventoryFormBtn) els.cancelInventoryFormBtn.addEventListener('click', closeInventoryForm);
    if (els.closeInventoryDetailBtn) els.closeInventoryDetailBtn.addEventListener('click', closeInventoryDetail);
    if (els.closeInventoryDetail2Btn) els.closeInventoryDetail2Btn.addEventListener('click', closeInventoryDetail);
    if (els.editInventoryBtn) els.editInventoryBtn.addEventListener('click', editCurrentInventory);
    if (els.deleteInventoryBtn) els.deleteInventoryBtn.addEventListener('click', deleteCurrentInventory);
    if (els.inventorySearchInput) els.inventorySearchInput.addEventListener('input', renderInventoryList);
    if (els.inventoryStatusFilter) els.inventoryStatusFilter.addEventListener('change', renderInventoryList);
    if (els.invShadePicker) {
      els.invShadePicker.addEventListener('change', () => {
        const opt = els.invShadePicker.selectedOptions[0];
        if (!opt || !opt.value) return;
        const nameEl = document.getElementById('invName');
        const brandEl = document.getElementById('invBrand');
        const priceEl = document.getElementById('invUnitPrice');
        if (nameEl && !nameEl.value) nameEl.value = opt.dataset.name || '';
        if (brandEl && !brandEl.value) brandEl.value = opt.dataset.brand || '';
        if (priceEl && (!priceEl.value || priceEl.value === '0')) priceEl.value = opt.dataset.price || '0';
      });
    }
  }

  return {
    openInventoryModal,
    closeInventoryModal,
    closeInventoryForm,
    closeInventoryDetail,
    wireListeners,
    clearCurrentInventory() {
      currentInventoryId = null;
      currentInventoryObj = null;
    },
  };
}
