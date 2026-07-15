import { showTransientToast } from '../app/toast.js';

const CUSTOMERS_CACHE_KEY = 'paintcrm_customers_cache_v1';

// Factory keeps DOM refs injected from script.js while moving CRM customer logic
// out of the monolith. Returns public handlers + a wireListeners() for startup.
export function createCustomersView({
  els,
  apiRequest,
  getApiToken,
  safeLsSet,
  closeLeadDetail,
}) {
  let crmCustomers = [];
  let currentCustomerId = null;
  let currentCustomerObj = null;
  let editingCustomerId = null;

  function saveCustomersCache(list) {
    try { safeLsSet(CUSTOMERS_CACHE_KEY, JSON.stringify(list || [])); } catch { /* storage full */ }
  }

  function loadCustomersCache() {
    try {
      const raw = localStorage.getItem(CUSTOMERS_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function hasCustomersCache() {
    return loadCustomersCache().length > 0;
  }

  function filterCustomersLocally(list, q) {
    const needle = (q || '').trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      [c.name, c.phone, c.email].some((v) => (v || '').toLowerCase().includes(needle))
    );
  }

  // Fetch customers from server; falls back to (and refreshes) the local cache.
  async function fetchCustomers(q = '') {
    if (!getApiToken()) {
      const cached = loadCustomersCache();
      return filterCustomersLocally(cached, q);
    }
    const path = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
    const { data, error } = await apiRequest('GET', path);
    if (error || !data?.customers) {
      return filterCustomersLocally(loadCustomersCache(), q);
    }
    crmCustomers = data.customers;
    if (!q) saveCustomersCache(crmCustomers);
    return crmCustomers;
  }

  function clearCache() {
    try { localStorage.removeItem(CUSTOMERS_CACHE_KEY); } catch { /* nothing */ }
    crmCustomers = [];
  }

  async function populateLeadCrmFields() {
    const signedIn = !!getApiToken();
    if (els.leadCustomerField) els.leadCustomerField.classList.toggle('hidden', !signedIn);
    if (els.leadSiteField) els.leadSiteField.classList.toggle('hidden', !signedIn);
    if (!signedIn || !els.leadCustomerSelect) return;

    const customers = await fetchCustomers();
    els.leadCustomerSelect.innerHTML = `<option value="">New customer (auto-create from phone)</option>`;
    customers.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} — ${c.phone}`;
      els.leadCustomerSelect.appendChild(opt);
    });
    if (els.leadSiteSelect) {
      els.leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
    }
  }

  async function populateLeadSites(customerId) {
    if (!els.leadSiteSelect || !customerId) {
      if (els.leadSiteSelect) els.leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
      return;
    }
    const { data, error } = await apiRequest('GET', `/api/sites?customerId=${encodeURIComponent(customerId)}`);
    els.leadSiteSelect.innerHTML = `<option value="">No site selected</option>`;
    if (error || !data?.sites) return;
    data.sites.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      els.leadSiteSelect.appendChild(opt);
    });
  }

  function openCustomersModal() {
    if (!els.customersModal) return;
    const signedIn = !!getApiToken();
    const showPanel = signedIn || hasCustomersCache();
    if (els.customersSignInPrompt) els.customersSignInPrompt.style.display = showPanel ? 'none' : 'block';
    if (els.customersPanel) els.customersPanel.style.display = showPanel ? 'block' : 'none';
    if (els.newCustomerBtn) els.newCustomerBtn.style.display = signedIn ? '' : 'none';
    els.customersModal.classList.remove('hidden');
    if (showPanel) renderCustomersList();
  }

  function closeCustomersModal() {
    if (els.customersModal) els.customersModal.classList.add('hidden');
  }

  async function renderCustomersList(q = '') {
    if (!els.customersListEl) return;
    els.customersListEl.innerHTML = `<p class="muted tiny">Loading…</p>`;
    const customers = await fetchCustomers(q);
    els.customersListEl.innerHTML = '';
    if (!customers.length) {
      els.customersListEl.innerHTML = `<p class="muted" style="padding:12px;">No customers yet. Save a lead or tap + New.</p>`;
      return;
    }
    customers.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'customer-card';
      card.innerHTML = `
      <div>
        <div class="name">${c.name}</div>
        <div class="phone">${c.phone}</div>
      </div>
      <div class="stats">${c.leadCount || 0} leads<br>${c.siteCount || 0} sites</div>
    `;
      card.addEventListener('click', () => {
        closeCustomersModal();
        openCustomerDetail(c.id);
      });
      els.customersListEl.appendChild(card);
    });
  }

  async function openCustomerDetail(customerId) {
    if (!els.customerDetailModal || !els.customerDetailBody) return;
    currentCustomerId = customerId;
    els.customerDetailBody.innerHTML = `<p class="muted tiny">Loading…</p>`;
    els.customerDetailModal.classList.remove('hidden');

    const online = !!getApiToken();
    const canManage = online;
    if (els.deleteCustomerBtn) els.deleteCustomerBtn.style.display = canManage ? '' : 'none';
    if (els.editCustomerBtn) els.editCustomerBtn.style.display = canManage ? '' : 'none';
    if (els.addSiteBtn) els.addSiteBtn.style.display = canManage ? '' : 'none';

    if (!online) {
      const cached = loadCustomersCache().find((c) => c.id === customerId);
      if (!cached) {
        els.customerDetailBody.innerHTML = `<p class="muted">Sign in to view this customer's full profile.</p>`;
        return;
      }
      renderCustomerDetail(cached, [], [], { offline: true });
      return;
    }

    const [customerRes, sitesRes, timelineRes] = await Promise.all([
      apiRequest('GET', `/api/customers/${customerId}`),
      apiRequest('GET', `/api/sites?customerId=${encodeURIComponent(customerId)}`),
      apiRequest('GET', `/api/customers/${customerId}/timeline`),
    ]);

    const customer = customerRes.data?.customer;
    const sites = sitesRes.data?.sites || [];
    const timeline = timelineRes.data?.timeline || [];
    if (!customer) {
      els.customerDetailBody.innerHTML = `<p class="muted">Customer not found.</p>`;
      return;
    }

    renderCustomerDetail(customer, sites, timeline, { offline: false });
  }

  function renderCustomerDetail(customer, sites, timeline, { offline }) {
    currentCustomerObj = customer;
    const typeLabel = customer.customerType === 'contractor' ? 'Contractor' : 'End customer';
    let html = `
    <div class="info">
      <div class="info-row"><span class="label">Name</span><strong>${customer.name}</strong></div>
      <div class="info-row"><span class="label">Phone</span><strong>${customer.phone}</strong></div>
      ${customer.email ? `<div class="info-row"><span class="label">Email</span>${customer.email}</div>` : ''}
      <div class="info-row"><span class="label">Type</span>${typeLabel}</div>
      ${customer.notes ? `<div class="info-row"><span class="label">Notes</span>${customer.notes}</div>` : ''}
    </div>
    <h4 style="margin:16px 0 8px;font-size:0.82rem;color:var(--muted);text-transform:uppercase;">Sites / Projects</h4>
    <div class="sites-list">
      ${sites.length ? sites.map((s) => `<span class="site-chip">${s.name}</span>`).join('') : `<span class="muted tiny">No sites yet</span>`}
    </div>
    <h4 style="margin:16px 0 8px;font-size:0.82rem;color:var(--muted);text-transform:uppercase;">Timeline</h4>
    <div class="timeline-list">
  `;

    if (offline) {
      html += `<p class="muted tiny">Showing cached profile. Sign in to load sites and full timeline.</p>`;
    } else if (!timeline.length) {
      html += `<p class="muted tiny">No activity yet.</p>`;
    } else {
      timeline.forEach((item) => {
        const when = new Date(item.ts).toLocaleString();
        const kind = (item.kind || '').replace(/_/g, ' ');
        html += `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div>
            <div class="kind">${kind}</div>
            <div><strong>${item.title || 'Activity'}</strong></div>
            <div class="when">${when}${item.siteName ? ` · ${item.siteName}` : ''}</div>
          </div>
        </div>
      `;
      });
    }

    html += `</div>`;
    els.customerDetailBody.innerHTML = html;
    const titleEl = document.getElementById('customerDetailTitle');
    if (titleEl) titleEl.textContent = customer.name;
  }

  function closeCustomerDetail() {
    if (els.customerDetailModal) els.customerDetailModal.classList.add('hidden');
    currentCustomerId = null;
  }

  function openNewCustomerModal(customer = null) {
    if (!els.newCustomerModal) return;
    editingCustomerId = customer?.id || null;
    if (els.newCustomerTitle) els.newCustomerTitle.textContent = customer ? 'Edit Customer' : 'New Customer';
    if (els.saveCustomerBtn) els.saveCustomerBtn.textContent = customer ? 'Update Customer' : 'Save Customer';

    const nameEl = document.getElementById('newCustomerName');
    const phoneEl = document.getElementById('newCustomerPhone');
    const emailEl = document.getElementById('newCustomerEmail');
    const typeEl = document.getElementById('newCustomerType');
    const notesEl = document.getElementById('newCustomerNotes');
    if (nameEl) nameEl.value = customer?.name || '';
    if (phoneEl) phoneEl.value = customer?.phone || '';
    if (emailEl) emailEl.value = customer?.email || '';
    if (typeEl) typeEl.value = customer?.customerType || 'end_customer';
    if (notesEl) notesEl.value = customer?.notes || '';

    els.newCustomerModal.classList.remove('hidden');
  }

  function closeNewCustomerModal() {
    if (els.newCustomerModal) els.newCustomerModal.classList.add('hidden');
    if (els.newCustomerForm) els.newCustomerForm.reset();
    editingCustomerId = null;
  }

  async function handleNewCustomerSubmit(e) {
    e.preventDefault();
    const name = (document.getElementById('newCustomerName')?.value || '').trim();
    const phone = (document.getElementById('newCustomerPhone')?.value || '').trim();
    const email = (document.getElementById('newCustomerEmail')?.value || '').trim();
    const customerType = document.getElementById('newCustomerType')?.value || 'end_customer';
    const notes = (document.getElementById('newCustomerNotes')?.value || '').trim();
    if (!name || !phone) return;

    const payload = { name, phone, email, notes, customerType };
    const { error } = editingCustomerId
      ? await apiRequest('PUT', `/api/customers/${editingCustomerId}`, payload)
      : await apiRequest('POST', '/api/customers', payload);

    if (error) {
      showTransientToast(error);
      return;
    }

    const wasEditing = editingCustomerId;
    closeNewCustomerModal();
    showTransientToast(`Customer ${name} ${wasEditing ? 'updated' : 'saved'}.`);
    await fetchCustomers();
    if (wasEditing && currentCustomerId === wasEditing) {
      openCustomerDetail(wasEditing);
    } else {
      renderCustomersList(els.customerSearchInput?.value || '');
    }
  }

  function editCurrentCustomer() {
    if (currentCustomerObj) openNewCustomerModal(currentCustomerObj);
  }

  async function deleteCurrentCustomer() {
    if (!currentCustomerId) return;
    const name = currentCustomerObj?.name || 'this customer';
    if (!confirm(`Delete ${name}? Their sites and timeline links will be removed. Captured leads are kept.`)) return;

    const { error } = await apiRequest('DELETE', `/api/customers/${currentCustomerId}`);
    if (error) {
      showTransientToast(error);
      return;
    }
    showTransientToast('Customer deleted.');
    closeCustomerDetail();
    await fetchCustomers();
    openCustomersModal();
  }

  function openSiteModal() {
    if (!els.siteModal || !currentCustomerId) return;
    if (els.siteForm) els.siteForm.reset();
    els.siteModal.classList.remove('hidden');
    setTimeout(() => document.getElementById('siteName')?.focus(), 0);
  }

  function closeSiteModal() {
    if (els.siteModal) els.siteModal.classList.add('hidden');
  }

  async function handleSiteSubmit(e) {
    e.preventDefault();
    if (!currentCustomerId) return;
    const name = (document.getElementById('siteName')?.value || '').trim();
    const address = (document.getElementById('siteAddress')?.value || '').trim();
    const status = document.getElementById('siteStatus')?.value || 'active';
    const notes = (document.getElementById('siteNotes')?.value || '').trim();
    if (!name) return;

    const { error } = await apiRequest('POST', '/api/sites', {
      customerId: currentCustomerId,
      name,
      address,
      status,
      notes,
    });
    if (error) {
      showTransientToast(error);
      return;
    }
    closeSiteModal();
    showTransientToast('Site added.');
    openCustomerDetail(currentCustomerId);
  }

  async function openCustomerFromLead(lead) {
    if (!getApiToken()) return;
    let customerId = lead.customerId;

    if (!customerId && lead.phone) {
      const { data } = await apiRequest('GET', `/api/customers?q=${encodeURIComponent(lead.phone)}`);
      const match = (data?.customers || []).find((c) => c.phone === lead.phone);
      customerId = match?.id || null;
    }

    if (!customerId) {
      showTransientToast('No linked customer yet. Sync this lead first.');
      return;
    }

    closeLeadDetail();
    openCustomerDetail(customerId);
  }

  function wireListeners() {
    if (els.customersBtn) els.customersBtn.addEventListener('click', openCustomersModal);
    if (els.closeCustomersBtn) els.closeCustomersBtn.addEventListener('click', closeCustomersModal);
    if (els.closeCustomers2Btn) els.closeCustomers2Btn.addEventListener('click', closeCustomersModal);
    if (els.newCustomerBtn) els.newCustomerBtn.addEventListener('click', () => openNewCustomerModal());
    if (els.closeNewCustomerBtn) els.closeNewCustomerBtn.addEventListener('click', closeNewCustomerModal);
    if (els.cancelNewCustomerBtn) els.cancelNewCustomerBtn.addEventListener('click', closeNewCustomerModal);
    if (els.newCustomerForm) els.newCustomerForm.addEventListener('submit', handleNewCustomerSubmit);
    if (els.closeCustomerDetailBtn) els.closeCustomerDetailBtn.addEventListener('click', closeCustomerDetail);
    if (els.closeCustomerDetail2Btn) els.closeCustomerDetail2Btn.addEventListener('click', closeCustomerDetail);
    if (els.addSiteBtn) els.addSiteBtn.addEventListener('click', openSiteModal);
    if (els.editCustomerBtn) els.editCustomerBtn.addEventListener('click', editCurrentCustomer);
    if (els.deleteCustomerBtn) els.deleteCustomerBtn.addEventListener('click', deleteCurrentCustomer);
    if (els.siteForm) els.siteForm.addEventListener('submit', handleSiteSubmit);
    if (els.closeSiteBtn) els.closeSiteBtn.addEventListener('click', closeSiteModal);
    if (els.cancelSiteBtn) els.cancelSiteBtn.addEventListener('click', closeSiteModal);
    if (els.customerSearchInput) {
      els.customerSearchInput.addEventListener('input', () => {
        renderCustomersList(els.customerSearchInput.value.trim());
      });
    }
    if (els.leadCustomerSelect) {
      els.leadCustomerSelect.addEventListener('change', () => {
        populateLeadSites(els.leadCustomerSelect.value);
      });
    }
  }

  return {
    fetchCustomers,
    populateLeadCrmFields,
    openCustomerFromLead,
    openCustomersModal,
    closeCustomersModal,
    closeCustomerDetail,
    closeNewCustomerModal,
    closeSiteModal,
    wireListeners,
    clearCache,
    clearCurrentCustomer() {
      currentCustomerId = null;
      currentCustomerObj = null;
    },
  };
}
