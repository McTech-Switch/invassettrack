// ─────────────────────────────────────────────
//  AssetTrack — app.js
//  Barcode scanning: html5-qrcode
//  Backend: Supabase (PostgreSQL + Auth)
// ─────────────────────────────────────────────

'use strict';

const SUPABASE_URL  = 'https://jksrecoxcfawtxtrfugs.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imprc3JlY294Y2Zhd3R4dHJmdWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNTkwMTQsImV4cCI6MjA5NDYzNTAxNH0.Nsm8LjNfBJutOg4ifN1bUpUnk5lcXNWEiqYhBltp7P0';

let sb = null; // Supabase client — set after SDK loads

// ── STATE ──────────────────────────────────────
const state = {
  user: null,
  items: [],
  borrows: [],
  filter: 'all',
  searchQuery: '',
  scanStream: null,
  scanInterval: null,
  miniScanStream: null,
  miniScanInterval: null,
  borrowScanStream: null,
  borrowScanInterval: null,
  zxing: null,
};

// ── LOAD LIBRARIES ────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadLibraries() {
  await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
  state.zxing = typeof Html5Qrcode !== 'undefined';
}

// ── AUTH ──────────────────────────────────────
async function signInWithEmail(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    // Try sign up if user doesn't exist
    if (error.message.includes('Invalid login')) {
      const { error: e2 } = await sb.auth.signUp({ email, password });
      if (e2) { showToast(e2.message); return; }
      showToast('Account created! Check your email to confirm.');
    } else {
      showToast(error.message);
    }
  }
}

async function signOut() {
  await sb.auth.signOut();
  state.user = null;
  state.items = [];
  state.borrows = [];
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

async function showApp(user) {
  state.user = user;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userEmail').textContent = user.email || user.user_metadata?.full_name || 'Signed in';
  await loadCustomLists();
  await loadAllData();
  renderInventory();
  renderBorrows();
}

// ── SUPABASE DATA ─────────────────────────────
function generateId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2,5).toUpperCase();
  return `INV-${ts}-${rnd}`;
}

async function loadAllData() {
  const [itemsRes, borrowsRes] = await Promise.all([
    sb.from('items').select('*').order('created_at', { ascending: false }),
    sb.from('borrows').select('*').order('created_at', { ascending: false }),
  ]);
  state.items   = itemsRes.data  || [];
  state.borrows = borrowsRes.data || [];
}

async function dbAddItem(item) {
  const row = {
    id: item.id, user_id: state.user.id,
    name: item.name, barcode: item.barcode,
    category: item.category, qty: item.qty,
    minstock: item.minstock, location: item.location,
    keywords: item.keywords, supplier: item.supplier,
    notes: item.notes, photo: item.photo,
  };
  const { error } = await sb.from('items').insert(row);
  if (error) { showToast('Save failed: ' + error.message); return false; }
  return true;
}

async function dbUpdateItem(id, changes) {
  const { error } = await sb.from('items').update(changes).eq('id', id);
  if (error) { showToast('Update failed: ' + error.message); return false; }
  return true;
}

async function dbDeleteItem(id) {
  const { error } = await sb.from('items').delete().eq('id', id);
  if (error) { showToast('Delete failed: ' + error.message); return false; }
  return true;
}

async function dbAddBorrow(borrow) {
  const row = {
    id: borrow.id, user_id: state.user.id,
    item_id: borrow.itemId, item_name: borrow.itemName,
    borrower: borrow.borrower, borrow_date: borrow.borrowDate,
    due_date: borrow.dueDate, returned: false,
  };
  const { error } = await sb.from('borrows').insert(row);
  if (error) { showToast('Save failed: ' + error.message); return false; }
  return true;
}

async function dbReturnBorrow(id, returnDate) {
  const { error } = await sb.from('borrows').update({ returned: true, return_date: returnDate }).eq('id', id);
  if (error) { showToast('Update failed: ' + error.message); return false; }
  return true;
}

async function dbAddCustom(table, name) {
  // Custom lists stored locally — simpler and faster
  void table; void name;
}

async function loadCustomLists() {
  customLocations  = JSON.parse(localStorage.getItem('at_locations')  || '[]');
  customCategories = JSON.parse(localStorage.getItem('at_categories') || '[]');
  customKeywords   = JSON.parse(localStorage.getItem('at_keywords')   || '[]');
}

function saveCustomLists() {
  localStorage.setItem('at_locations',  JSON.stringify(customLocations));
  localStorage.setItem('at_categories', JSON.stringify(customCategories));
  localStorage.setItem('at_keywords',   JSON.stringify(customKeywords));
}

// ── TOAST ─────────────────────────────────────
function showToast(msg, duration = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 200);
  }, duration);
}

// ── TABS ──────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${tabName}`));
  if (tabName !== 'scan') stopScan('main');
  if (tabName !== 'add') stopScan('mini');
  if (tabName !== 'borrow') stopScan('borrow');
}

// ── INVENTORY RENDER ──────────────────────────
function renderInventory() {
  const list = document.getElementById('inventoryList');
  let items = [...state.items];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.barcode || '').includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.location || '').toLowerCase().includes(q) ||
      (i.keywords || '').toLowerCase().includes(q)
    );
  }

  if (state.filter === 'low') {
    items = items.filter(i => parseInt(i.qty) <= parseInt(i.minstock || 0) && parseInt(i.qty) >= 0);
  } else if (state.filter === 'borrowed') {
    const borrowedIds = state.borrows.filter(b => !b.returned).map(b => b.itemId);
    items = items.filter(i => borrowedIds.includes(i.id));
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>
      <p>${state.searchQuery ? 'No items match your search.' : 'No items yet.<br/>Add your first item using the + tab.'}</p>
    </div>`;
    return;
  }

  const borrowedIds = state.borrows.filter(b => !b.returned).map(b => b.itemId);

  list.innerHTML = items.map(item => {
    const low = parseInt(item.qty) <= parseInt(item.minstock || 0) && parseInt(item.qty) >= 0 && item.minstock;
    const borrowed = borrowedIds.includes(item.id);
    const cls = low ? 'low-stock' : borrowed ? 'borrowed' : '';
    return `<div class="item-card ${cls}" onclick="showItemDetail('${item.id}')">
      <div class="item-card-top">
        <span class="item-name">${esc(item.name)}</span>
        <span class="item-qty ${low ? 'warn' : ''}">Qty: ${item.qty ?? '?'}</span>
      </div>
      <div class="item-meta">
        ${item.category ? `<span class="item-cat">${esc(item.category)}</span>` : ''}
        ${item.location ? `<span class="item-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>${esc(item.location)}</span>` : ''}
        ${item.barcode ? `<span class="item-tag" style="color:var(--text3)">${esc(item.barcode)}</span>` : ''}
        ${borrowed ? `<span class="item-tag" style="color:var(--accent2)">On Loan</span>` : ''}
        ${low ? `<span class="item-tag" style="color:var(--warn)">⚠ Low Stock</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── ITEM DETAIL ───────────────────────────────
window.showItemDetail = function(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const modal = document.getElementById('itemModal');
  const content = document.getElementById('modalContent');
  const activeBorrow = state.borrows.find(b => b.itemId === id && !b.returned);

  content.innerHTML = `<div class="modal-detail">
    <h2>${esc(item.name)}</h2>
    <div class="modal-barcode">${item.barcode ? `Barcode: ${esc(item.barcode)}` : 'No barcode'} · ${esc(item.id)}</div>
    <div class="detail-grid">
      <div class="detail-cell"><div class="label">Quantity</div><div class="value">${item.qty ?? '—'}</div></div>
      <div class="detail-cell"><div class="label">Min Stock</div><div class="value">${item.minstock || '—'}</div></div>
      <div class="detail-cell"><div class="label">Category</div><div class="value">${esc(item.category) || '—'}</div></div>
      <div class="detail-cell"><div class="label">Location</div><div class="value">${esc(item.location) || '—'}</div></div>
      ${item.supplier ? `<div class="detail-cell full"><div class="label">Supplier</div><div class="value">${esc(item.supplier)}</div></div>` : ''}
      ${item.keywords ? `<div class="detail-cell full"><div class="label">Keywords</div><div class="value">${esc(item.keywords)}</div></div>` : ''}
      ${item.notes ? `<div class="detail-cell full"><div class="label">Notes</div><div class="value">${esc(item.notes)}</div></div>` : ''}
      ${activeBorrow ? `<div class="detail-cell full" style="border-color:rgba(124,58,237,0.3)"><div class="label" style="color:var(--accent2)">Currently Borrowed By</div><div class="value">${esc(activeBorrow.borrower)} — due ${activeBorrow.dueDate || 'no date'}</div></div>` : ''}
    </div>
    <div class="detail-actions">
      <button class="btn-ghost" onclick="editQty('${id}')">Update Qty</button>
      <button class="btn-outline danger" onclick="deleteItem('${id}')">Delete</button>
    </div>
  </div>`;

  modal.classList.remove('hidden');
};

window.editQty = async function(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const newQty = prompt(`Update quantity for "${item.name}":`, item.qty);
  if (newQty === null) return;
  const parsed = parseInt(newQty);
  if (isNaN(parsed)) { showToast('Invalid quantity'); return; }
  const ok = await dbUpdateItem(id, { qty: parsed });
  if (!ok) return;
  item.qty = parsed;
  renderInventory();
  document.getElementById('itemModal').classList.add('hidden');
  showToast('Quantity updated');
};

window.deleteItem = async function(id) {
  if (!confirm('Delete this item?')) return;
  const ok = await dbDeleteItem(id);
  if (!ok) return;
  state.items = state.items.filter(i => i.id !== id);
  renderInventory();
  document.getElementById('itemModal').classList.add('hidden');
  showToast('Item deleted');
};

// ── BARCODE LOOKUP ────────────────────────────
function lookupBarcode(barcode) {
  const b = barcode.trim();
  if (!b) return null;
  return state.items.find(i => i.barcode === b || i.name.toLowerCase() === b.toLowerCase() || i.id === b) || null;
}

function showScanResult(item, containerId) {
  const el = document.getElementById(containerId);
  if (!item) {
    el.className = 'scan-result not-found';
    el.innerHTML = `<div style="color:var(--danger)">❌ No item found for that barcode.</div>`;
    el.classList.remove('hidden');
    return;
  }
  el.className = 'scan-result found';
  el.innerHTML = `<div style="font-family:var(--display);font-size:16px;font-weight:700;margin-bottom:6px">${esc(item.name)}</div>
    <div style="font-size:13px;color:var(--text2)">📍 ${esc(item.location) || 'No location'}</div>
    <div style="font-size:13px;color:var(--text2)">Qty: ${item.qty ?? '?'} &nbsp;·&nbsp; ${esc(item.category) || ''}</div>
    <button class="btn-accent" style="margin-top:10px;width:100%" onclick="showItemDetail('${item.id}')">View Full Details</button>`;
  el.classList.remove('hidden');
}

// ── CAMERA / SCAN ─────────────────────────────
// Uses html5-qrcode which handles its own video, camera, and decode loop.
// Much more reliable than ZXing on iPhone Safari and Chrome.

// html5-qrcode needs a real div element as its mount point.
// We use hidden divs in the HTML for each scan mode.
const scanDivIds = {
  main:   'scannerRegion',
  mini:   'miniScannerRegion',
  borrow: 'borrowScannerRegion',
};

const scanners = { main: null, mini: null, borrow: null };

function setScanStatus(msg) {
  const el = document.getElementById('scanStatus');
  if (el) el.textContent = msg;
}

async function startScan(mode) {
  if (!state.zxing) {
    showToast('Scanner still loading — wait a moment and try again');
    return;
  }

  await stopScan(mode);

  const divId = scanDivIds[mode];
  const regionEl = document.getElementById(divId);
  if (!regionEl) { showToast('Scanner region missing'); return; }

  // Show the scanner UI
  regionEl.style.display = 'block';
  if (mode === 'main') {
    const s = document.getElementById('startScanBtn'); if (s) s.style.display = 'none';
    const x = document.getElementById('stopScanBtn');  if (x) x.style.display = 'block';
    const p = document.getElementById('scannerPlaceholder'); if (p) p.style.display = 'none';
    setScanStatus('Scanning… hold steady');
  } else {
    const miniEl = mode === 'mini' ? 'miniScanner' : 'borrowMiniScanner';
    const el = document.getElementById(miniEl); if (el) el.classList.remove('hidden');
  }

  try {
    const scanner = new Html5Qrcode(divId);
    scanners[mode] = scanner;

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 180 },
        aspectRatio: 1.0,
        supportedScanTypes: [
          Html5QrcodeScanType.SCAN_TYPE_CAMERA
        ],
      },
      (decodedText) => {
        // Success callback — barcode found
        console.log('✓ Scanned:', decodedText);
        setScanStatus('✓ Got it!');
        stopScan(mode);
        onScanResult(mode, decodedText);
      },
      (errorMsg) => {
        // Per-frame error — normal when no barcode in frame, ignore
      }
    );

  } catch (err) {
    setScanStatus('');
    console.error('Scanner error:', err);
    if (String(err).includes('Permission') || String(err).includes('NotAllowed')) {
      showToast('Camera blocked — allow camera access in your browser settings');
    } else {
      showToast('Camera error: ' + err);
    }
    await stopScan(mode);
  }
}

async function stopScan(mode) {
  const scanner = scanners[mode];
  if (scanner) {
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {}
    scanners[mode] = null;
  }

  const divId = scanDivIds[mode];
  const regionEl = document.getElementById(divId);
  if (regionEl) regionEl.style.display = 'none';

  if (mode === 'main') {
    const s = document.getElementById('startScanBtn'); if (s) s.style.display = 'block';
    const x = document.getElementById('stopScanBtn');  if (x) x.style.display = 'none';
    const p = document.getElementById('scannerPlaceholder'); if (p) p.style.display = 'block';
    setScanStatus('');
  } else {
    const miniElId = mode === 'mini' ? 'miniScanner' : 'borrowMiniScanner';
    const miniEl = document.getElementById(miniElId); if (miniEl) miniEl.classList.add('hidden');
  }
}

function onScanResult(mode, code) {
  if (mode === 'main') {
    showScanResult(lookupBarcode(code), 'scanResult');
    showToast('Scanned: ' + code);
  } else if (mode === 'mini') {
    handleWizardScan(code);
  } else {
    document.getElementById('b-item').value = code;
    handleBorrowItemLookup(code);
    showToast('Scanned: ' + code);
  }
}

// ── ITEM WIZARD ───────────────────────────────
const wz = {
  barcode: '', name: '', location: '', category: '',
  keywords: [], qty: 1, minstock: 0, supplier: '', notes: '', photo: '',
};

const DEFAULT_LOCATIONS = ['IT Room Shelf A1','IT Room Shelf B2','Science Lab Cabinet','Drama Room Rack','Storage Room','Library Shelf'];
const DEFAULT_CATEGORIES = ['Electronics','Cables & Adapters','Furniture','Stationery','Lab Equipment','Costumes & Props','Tools','Other'];
const DEFAULT_KEYWORDS   = ['cable','laptop','charger','monitor','display','projector','keyboard','mouse','adapter','USB','HDMI','power'];

let customLocations  = JSON.parse(localStorage.getItem('at_locations')  || '[]');
let customCategories = JSON.parse(localStorage.getItem('at_categories') || '[]');
let customKeywords   = JSON.parse(localStorage.getItem('at_keywords')   || '[]');

function saveCustomLists() {
  localStorage.setItem('at_locations',  JSON.stringify(customLocations));
  localStorage.setItem('at_categories', JSON.stringify(customCategories));
  localStorage.setItem('at_keywords',   JSON.stringify(customKeywords));
}

function openWizard() {
  // Reset state
  Object.assign(wz, { barcode:'', name:'', location:'', category:'', keywords:[], qty:1, minstock:0, supplier:'', notes:'', photo:'' });
  wzGoTo(0);
  document.getElementById('wizardModal').classList.remove('hidden');
  // Start scanner for step 0
  setTimeout(() => startScan('mini'), 300);
}

function closeWizard() {
  stopScan('mini');
  document.getElementById('wizardModal').classList.add('hidden');
}

function wzGoTo(step) {
  document.querySelectorAll('.wizard-step').forEach((el, i) => {
    el.classList.toggle('hidden', i !== step);
  });
  if (step === 2) renderWzChips('location');
  if (step === 3) renderWzChips('category');
  if (step === 4) renderWzChips('keywords');
}

function renderWzChips(type) {
  if (type === 'location') {
    const all = [...DEFAULT_LOCATIONS, ...customLocations];
    const el = document.getElementById('wz-location-chips');
    el.innerHTML = all.map(l => `<button class="wz-chip${wz.location===l?' selected':''}" onclick="wzSelectChip('location','${esc(l)}')">${esc(l)}</button>`).join('');
  } else if (type === 'category') {
    const all = [...DEFAULT_CATEGORIES, ...customCategories];
    const el = document.getElementById('wz-category-chips');
    el.innerHTML = all.map(c => `<button class="wz-chip${wz.category===c?' selected':''}" onclick="wzSelectChip('category','${esc(c)}')">${esc(c)}</button>`).join('');
  } else if (type === 'keywords') {
    const all = [...DEFAULT_KEYWORDS, ...customKeywords];
    const el = document.getElementById('wz-keyword-chips');
    el.innerHTML = all.map(k => `<button class="wz-chip keyword-chip${wz.keywords.includes(k)?' selected':''}" onclick="wzToggleKeyword('${esc(k)}')">${esc(k)}</button>`).join('');
  }
}

window.wzSelectChip = function(type, val) {
  if (type === 'location') { wz.location = val; renderWzChips('location'); }
  if (type === 'category') { wz.category = val; renderWzChips('category'); }
};

window.wzToggleKeyword = function(kw) {
  if (wz.keywords.includes(kw)) wz.keywords = wz.keywords.filter(k => k !== kw);
  else wz.keywords.push(kw);
  renderWzChips('keywords');
};

async function wzSaveItem() {
  if (!wz.name.trim()) { showToast('Item name is required'); wzGoTo(1); return; }
  const item = {
    id: generateId(),
    name: wz.name.trim(),
    barcode: wz.barcode,
    category: wz.category,
    qty: parseInt(wz.qty) || 1,
    minstock: parseInt(wz.minstock) || 0,
    location: wz.location,
    keywords: wz.keywords.join(', '),
    supplier: wz.supplier,
    notes: wz.notes,
    photo: wz.photo,
    created_at: new Date().toISOString(),
  };
  const ok = await dbAddItem(item);
  if (!ok) return;
  state.items.unshift(item);
  renderInventory();
  closeWizard();
  showToast(`✓ ${item.name} saved`);
}

function initWizard() {
  // New Item button
  document.getElementById('newItemBtn').addEventListener('click', openWizard);
  document.getElementById('newItemManualBtn').addEventListener('click', () => {
    openWizard();
    setTimeout(() => {
      stopScan('mini');
      wzGoTo(1); // skip straight to name entry
    }, 100);
  });

  // Backdrop close
  document.getElementById('wizardBackdrop').addEventListener('click', closeWizard);

  // Step 0 — scan result handled in onScanResult via mode 'mini'
  document.getElementById('wz-barcode-confirm').addEventListener('click', () => {
    const val = document.getElementById('wz-barcode-manual').value.trim();
    wz.barcode = val;
    stopScan('mini');
    const badge = document.getElementById('wz-barcode-badge');
    badge.textContent = val ? `Barcode: ${val}` : '';
    wzGoTo(1);
  });
  document.getElementById('wzSkipBarcode').addEventListener('click', () => {
    wz.barcode = '';
    stopScan('mini');
    wzGoTo(1);
  });

  // Step 1 — name
  document.getElementById('wz-name-next').addEventListener('click', () => {
    const val = document.getElementById('wz-name').value.trim();
    if (!val) { showToast('Please enter a name'); return; }
    wz.name = val;
    wzGoTo(2);
  });
  document.getElementById('wz-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('wz-name-next').click();
  });

  // Step 2 — location
  document.getElementById('wz-location-add').addEventListener('click', () => {
    const val = document.getElementById('wz-location-new').value.trim();
    if (!val) return;
    if (!customLocations.includes(val) && !DEFAULT_LOCATIONS.includes(val)) {
      customLocations.push(val);
      saveCustomLists();
    }
    wz.location = val;
    document.getElementById('wz-location-new').value = '';
    renderWzChips('location');
  });
  document.getElementById('wz-location-next').addEventListener('click', () => {
    const typed = document.getElementById('wz-location-new').value.trim();
    if (typed) wz.location = typed;
    wzGoTo(3);
  });
  document.getElementById('wz-location-skip').addEventListener('click', () => { wz.location = ''; wzGoTo(3); });

  // Step 3 — category
  document.getElementById('wz-category-add').addEventListener('click', () => {
    const val = document.getElementById('wz-category-new').value.trim();
    if (!val) return;
    if (!customCategories.includes(val) && !DEFAULT_CATEGORIES.includes(val)) {
      customCategories.push(val);
      saveCustomLists();
    }
    wz.category = val;
    document.getElementById('wz-category-new').value = '';
    renderWzChips('category');
  });
  document.getElementById('wz-category-next').addEventListener('click', () => {
    const typed = document.getElementById('wz-category-new').value.trim();
    if (typed) wz.category = typed;
    wzGoTo(4);
  });
  document.getElementById('wz-category-skip').addEventListener('click', () => { wz.category = ''; wzGoTo(4); });

  // Step 4 — keywords + details
  document.getElementById('wz-keyword-add').addEventListener('click', () => {
    const val = document.getElementById('wz-keyword-new').value.trim();
    if (!val) return;
    if (!customKeywords.includes(val) && !DEFAULT_KEYWORDS.includes(val)) {
      customKeywords.push(val);
      saveCustomLists();
    }
    if (!wz.keywords.includes(val)) wz.keywords.push(val);
    document.getElementById('wz-keyword-new').value = '';
    renderWzChips('keywords');
  });
  document.getElementById('wz-details-next').addEventListener('click', () => {
    wz.qty      = document.getElementById('wz-qty').value || 1;
    wz.minstock = document.getElementById('wz-minstock').value || 0;
    wz.supplier = document.getElementById('wz-supplier').value.trim();
    wz.notes    = document.getElementById('wz-notes').value.trim();
    wzGoTo(5);
  });

  // Step 5 — photo
  document.getElementById('wz-photo-btn').addEventListener('click', () => {
    document.getElementById('wz-photo-input').click();
  });
  document.getElementById('wz-photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      wz.photo = ev.target.result;
      const preview = document.getElementById('wz-photo-preview');
      preview.innerHTML = `<img src="${wz.photo}" alt="Item photo" />`;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('wz-save-btn').addEventListener('click', wzSaveItem);
  document.getElementById('wz-skip-photo').addEventListener('click', wzSaveItem);
}

// Called by onScanResult when mode === 'mini' (wizard scan step)
function handleWizardScan(code) {
  wz.barcode = code;
  const badge = document.getElementById('wz-barcode-badge');
  if (badge) badge.textContent = `Barcode: ${code}`;
  wzGoTo(1);
  // Pre-fill name input if we can look it up
  const existing = lookupBarcode(code);
  if (existing) {
    showToast(`"${existing.name}" already exists — editing quantity`);
    closeWizard();
    showItemDetail(existing.id);
  }
}

// ── BORROW ────────────────────────────────────
function handleBorrowItemLookup(query) {
  const item = lookupBarcode(query);
  const preview = document.getElementById('borrowItemResult');
  if (!item) {
    preview.innerHTML = `<span style="color:var(--danger)">No item found.</span>`;
    preview.classList.remove('hidden');
    return;
  }
  preview.innerHTML = `<strong>${esc(item.name)}</strong>${esc(item.location) || ''} · Qty: ${item.qty}`;
  preview.classList.remove('hidden');
  preview.dataset.itemId = item.id;
  preview.dataset.itemName = item.name;
}

async function recordBorrow() {
  const query = document.getElementById('b-item').value.trim();
  const borrower = document.getElementById('b-name').value.trim();
  if (!query || !borrower) { showToast('Fill in item and borrower name'); return; }

  const preview = document.getElementById('borrowItemResult');
  const itemId = preview.dataset.itemId || query;
  const item = state.items.find(i => i.id === itemId) || lookupBarcode(query);
  if (!item) { showToast('Item not found'); return; }

  const borrow = {
    id: `BRW-${Date.now()}`,
    itemId: item.id,
    itemName: item.name,
    borrower,
    borrowDate: new Date().toLocaleDateString('en-AU'),
    dueDate: document.getElementById('b-date').value,
    returned: false,
  };
  const ok = await dbAddBorrow(borrow);
  if (!ok) return;
  // Store locally with snake_case to match DB shape
  state.borrows.unshift({ ...borrow, item_id: borrow.itemId, item_name: borrow.itemName, borrow_date: borrow.borrowDate, due_date: borrow.dueDate });
  renderBorrows();
  document.getElementById('b-item').value = '';
  document.getElementById('b-name').value = '';
  document.getElementById('b-date').value = '';
  document.getElementById('borrowItemResult').classList.add('hidden');
  showToast(`Borrow recorded for ${item.name}`);
}

async function recordReturn() {
  const query = document.getElementById('b-item').value.trim();
  if (!query) { showToast('Enter item barcode or name'); return; }
  const item = lookupBarcode(query);
  if (!item) { showToast('Item not found'); return; }

  const borrow = state.borrows.find(b => (b.item_id || b.itemId) === item.id && !b.returned);
  if (!borrow) { showToast('No active borrow found for this item'); return; }

  const returnDate = new Date().toLocaleDateString('en-AU');
  const ok = await dbReturnBorrow(borrow.id, returnDate);
  if (!ok) return;
  borrow.returned = true;
  borrow.return_date = returnDate;
  renderBorrows();
  renderInventory();
  document.getElementById('b-item').value = '';
  document.getElementById('borrowItemResult').classList.add('hidden');
  showToast(`${item.name} returned`);
}

function renderBorrows() {
  const list = document.getElementById('borrowList');
  const active = state.borrows.filter(b => !b.returned);
  if (active.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:24px 0"><p>No active borrows.</p></div>`;
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  list.innerHTML = active.map(b => {
    const itemName   = b.item_name  || b.itemName  || '';
    const borrowDate = b.borrow_date || b.borrowDate || '';
    const dueDate    = b.due_date   || b.dueDate   || '';
    const due = dueDate ? new Date(dueDate) : null;
    const overdue = due && due < today;
    return `<div class="borrow-card">
      <div class="borrow-item">${esc(itemName)}</div>
      <div class="borrow-who">Borrowed by: ${esc(b.borrower)}</div>
      <div class="borrow-date ${overdue ? 'borrow-overdue' : ''}">
        Borrowed: ${borrowDate} ${dueDate ? `· Due: ${dueDate}${overdue ? ' ⚠ OVERDUE' : ''}` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── ACCOUNT ───────────────────────────────────
function openSetup() {
  document.getElementById('setupModal').classList.remove('hidden');
  document.getElementById('userEmailDisplay').textContent = state.user?.email || state.user?.user_metadata?.full_name || '';
}

function saveSetup() {
  document.getElementById('setupModal').classList.add('hidden');
}

// ── UTIL ──────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INIT ──────────────────────────────────────
async function init() {
  // Show splash, load libraries in parallel
  await loadLibraries();

  // Hide splash
  document.getElementById('splash').classList.add('fade-out');
  setTimeout(() => document.getElementById('splash').style.display = 'none', 400);

  // ── AUTH VIEWS ──────────────────────────────
  function showView(id) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  // Navigation
  document.getElementById('goSignUp').addEventListener('click',   () => showView('viewSignUp'));
  document.getElementById('goSignIn').addEventListener('click',   () => showView('viewSignIn'));
  document.getElementById('goForgot').addEventListener('click',   () => showView('viewForgot'));
  document.getElementById('forgotBack').addEventListener('click', () => showView('viewSignIn'));
  document.getElementById('tfa2Back').addEventListener('click',   () => showView('viewSignIn'));
  document.getElementById('setup2FABack').addEventListener('click',() => showView('viewSignIn'));

  // Show/hide password toggles
  function togglePw(inputId, btnId) {
    const inp = document.getElementById(inputId);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }
  document.getElementById('siEye').addEventListener('click', () => togglePw('siPass'));
  document.getElementById('suEye').addEventListener('click', () => togglePw('suPass'));

  // Password strength meter
  document.getElementById('suPass').addEventListener('input', e => {
    const v = e.target.value;
    const bar = document.getElementById('pwBar');
    const lbl = document.getElementById('pwLabel');
    let score = 0;
    if (v.length >= 8)  score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const levels = [
      { w:'0%',   bg:'transparent', t:'' },
      { w:'25%',  bg:'#ef4444', t:'Weak' },
      { w:'50%',  bg:'#f59e0b', t:'Fair' },
      { w:'75%',  bg:'#3b82f6', t:'Good' },
      { w:'100%', bg:'#10b981', t:'Strong' },
    ];
    const l = levels[Math.min(score, 4)];
    bar.style.width = l.w; bar.style.background = l.bg;
    lbl.textContent = l.t; lbl.style.color = l.bg;
  });

  // Sign In
  document.getElementById('siBtn').addEventListener('click', async () => {
    const email = document.getElementById('siEmail').value.trim();
    const pass  = document.getElementById('siPass').value;
    const err   = document.getElementById('siError');
    err.classList.add('hidden');
    if (!email || !pass) { err.textContent = 'Please fill in all fields'; err.classList.remove('hidden'); return; }
    document.getElementById('siBtnText').textContent = 'Signing in…';
    document.getElementById('siSpinner').classList.remove('hidden');
    document.getElementById('siBtn').disabled = true;

    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

    document.getElementById('siBtnText').textContent = 'Sign In';
    document.getElementById('siSpinner').classList.add('hidden');
    document.getElementById('siBtn').disabled = false;

    if (error) {
      err.textContent = error.message === 'Invalid login credentials'
        ? 'Incorrect email or password' : error.message;
      err.classList.remove('hidden');
      return;
    }

    // Check if 2FA is required
    if (data?.session === null && data?.user === null) {
      // MFA challenge needed — this is handled by onAuthStateChange
    }
  });
  document.getElementById('siPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('siBtn').click();
  });

  // Sign Up
  document.getElementById('suBtn').addEventListener('click', async () => {
    const email   = document.getElementById('suEmail').value.trim();
    const pass    = document.getElementById('suPass').value;
    const confirm = document.getElementById('suConfirm').value;
    const err     = document.getElementById('suError');
    err.classList.add('hidden');
    if (!email || !pass) { err.textContent = 'Please fill in all fields'; err.classList.remove('hidden'); return; }
    if (pass.length < 8)  { err.textContent = 'Password must be at least 8 characters'; err.classList.remove('hidden'); return; }
    if (pass !== confirm) { err.textContent = 'Passwords do not match'; err.classList.remove('hidden'); return; }

    document.getElementById('suBtnText').textContent = 'Creating account…';
    document.getElementById('suSpinner').classList.remove('hidden');
    document.getElementById('suBtn').disabled = true;

    const { error } = await sb.auth.signUp({ email, password: pass });

    document.getElementById('suBtnText').textContent = 'Create Account';
    document.getElementById('suSpinner').classList.add('hidden');
    document.getElementById('suBtn').disabled = false;

    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
    showToast('Account created! Check your email to confirm, then sign in.');
    showView('viewSignIn');
  });

  // Forgot password
  document.getElementById('fpBtn').addEventListener('click', async () => {
    const email = document.getElementById('fpEmail').value.trim();
    const err   = document.getElementById('fpError');
    const suc   = document.getElementById('fpSuccess');
    err.classList.add('hidden'); suc.classList.add('hidden');
    if (!email) { err.textContent = 'Enter your email'; err.classList.remove('hidden'); return; }

    document.getElementById('fpBtnText').textContent = 'Sending…';
    document.getElementById('fpSpinner').classList.remove('hidden');
    document.getElementById('fpBtn').disabled = true;

    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href
    });

    document.getElementById('fpBtnText').textContent = 'Send Reset Link';
    document.getElementById('fpSpinner').classList.add('hidden');
    document.getElementById('fpBtn').disabled = false;

    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
    suc.classList.remove('hidden');
  });

  // OTP boxes — auto-advance and auto-submit
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', e => {
      const v = e.target.value.replace(/\D/g,'');
      e.target.value = v;
      if (v && i < otpBoxes.length - 1) otpBoxes[i+1].focus();
      if (i === otpBoxes.length - 1 && v) document.getElementById('tfaBtn').click();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i-1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'');
      otpBoxes.forEach((b, j) => { b.value = text[j] || ''; });
      if (text.length >= 6) document.getElementById('tfaBtn').click();
    });
  });

  // 2FA verify
  document.getElementById('tfaBtn').addEventListener('click', async () => {
    const code = [...otpBoxes].map(b => b.value).join('');
    const err  = document.getElementById('tfaError');
    err.classList.add('hidden');
    if (code.length < 6) { err.textContent = 'Enter the 6-digit code'; err.classList.remove('hidden'); return; }

    document.getElementById('tfaBtnText').textContent = 'Verifying…';
    document.getElementById('tfaSpinner').classList.remove('hidden');
    document.getElementById('tfaBtn').disabled = true;

    const { data, error } = await sb.auth.mfa.challengeAndVerify({
      factorId: window._mfaFactorId,
      code,
    });

    document.getElementById('tfaBtnText').textContent = 'Verify';
    document.getElementById('tfaSpinner').classList.add('hidden');
    document.getElementById('tfaBtn').disabled = false;

    if (error) { err.textContent = 'Incorrect code — try again'; err.classList.remove('hidden'); return; }
    // Auth state change will fire and call showApp
  });

  // Setup 2FA (from account modal)
  document.getElementById('setup2FABtn').addEventListener('click', async () => {
    const code  = document.getElementById('setup2FACode').value.trim();
    const err   = document.getElementById('setup2FAError');
    err.classList.add('hidden');
    if (!code || code.length < 6) { err.textContent = 'Enter the 6-digit code'; err.classList.remove('hidden'); return; }

    const { data, error } = await sb.auth.mfa.challengeAndVerify({
      factorId: window._enrollFactorId,
      code,
    });
    if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
    showToast('✓ Two-factor authentication enabled');
    document.getElementById('setupModal').classList.add('hidden');
  });

  // Check if already logged in (e.g. OAuth redirect back)
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await showApp(session.user);
  } else {
    showAuthScreen();
  }

  // Listen for auth state changes (OAuth redirect, sign out)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      await showApp(session.user);
    } else {
      showAuthScreen();
    }
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderInventory();
  });

  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      renderInventory();
    });
  });

  // Scan page
  document.getElementById('startScanBtn').addEventListener('click', () => startScan('main'));
  document.getElementById('stopScanBtn').addEventListener('click', () => stopScan('main'));
  document.getElementById('manualLookupBtn').addEventListener('click', () => {
    const code = document.getElementById('manualBarcode').value.trim();
    if (!code) return;
    showScanResult(lookupBarcode(code), 'scanResult');
  });
  document.getElementById('manualBarcode').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('manualLookupBtn').click();
  });

  // Add item — wizard
  initWizard();

  // Borrow page
  document.getElementById('borrowBtn').addEventListener('click', recordBorrow);
  document.getElementById('returnBtn').addEventListener('click', recordReturn);
  document.getElementById('borrowScanBtn').addEventListener('click', () => {
    document.getElementById('borrowMiniScanner').classList.remove('hidden');
    startScan('borrow');
  });
  document.getElementById('closeBorrowScanner').addEventListener('click', () => {
    stopScan('borrow');
    document.getElementById('borrowMiniScanner').classList.add('hidden');
  });
  document.getElementById('b-item').addEventListener('input', e => {
    if (e.target.value.length > 2) handleBorrowItemLookup(e.target.value);
  });

  // Modals
  document.getElementById('modalBackdrop').addEventListener('click', () => {
    document.getElementById('itemModal').classList.add('hidden');
  });
  document.getElementById('setupBtn').addEventListener('click', openSetup);
  document.getElementById('setupBackdrop').addEventListener('click', () => {
    document.getElementById('setupModal').classList.add('hidden');
  });
  document.getElementById('saveSetupBtn').addEventListener('click', saveSetup);
  document.getElementById('signOutBtn').addEventListener('click', signOut);
  document.getElementById('setup2FAModalBtn').addEventListener('click', async () => {
    document.getElementById('setupModal').classList.add('hidden');
    // Enroll TOTP factor
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', issuer: 'AssetTrack' });
    if (error) { showToast('2FA setup failed: ' + error.message); return; }
    window._enrollFactorId = data.id;
    // Show QR code
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `<img src="${data.totp.qr_code}" style="width:160px;height:160px" />`;
    document.getElementById('totpSecret').textContent = 'Manual code: ' + data.totp.secret;
    document.getElementById('setup2FACode').value = '';
    document.getElementById('setup2FAError').classList.add('hidden');
    // Show the setup 2FA view in auth screen
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
    document.getElementById('viewSetup2FA').classList.remove('hidden');
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
