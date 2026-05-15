// ─────────────────────────────────────────────
//  AssetTrack — app.js
//  Barcode scanning via ZXing (loaded from CDN)
//  Storage: localStorage + optional Google Sheets
// ─────────────────────────────────────────────

'use strict';

// ── STATE ──────────────────────────────────────
const state = {
  items: [],
  borrows: [],
  filter: 'all',
  searchQuery: '',
  sheetsUrl: '',
  scanStream: null,
  scanInterval: null,
  miniScanStream: null,
  miniScanInterval: null,
  borrowScanStream: null,
  borrowScanInterval: null,
  zxing: null,
};

// ── LOAD ZXING ────────────────────────────────
function loadZXing() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
    script.onload = () => {
      // Just flag that ZXing is available — we create readers per-scan
      if (typeof ZXing !== 'undefined') {
        state.zxing = true;
        resolve(true);
      } else {
        resolve(false);
      }
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

// ── STORAGE ───────────────────────────────────
function saveLocal() {
  localStorage.setItem('assettrack_items', JSON.stringify(state.items));
  localStorage.setItem('assettrack_borrows', JSON.stringify(state.borrows));
}

function loadLocal() {
  try {
    state.items = JSON.parse(localStorage.getItem('assettrack_items') || '[]');
    state.borrows = JSON.parse(localStorage.getItem('assettrack_borrows') || '[]');
    state.sheetsUrl = localStorage.getItem('assettrack_sheets_url') || '';
  } catch {
    state.items = [];
    state.borrows = [];
  }
}

function generateId() {
  const num = (state.items.length + 1).toString().padStart(3, '0');
  return `INV-${num}`;
}

// ── GOOGLE SHEETS ─────────────────────────────
async function syncFromSheets() {
  if (!state.sheetsUrl) return false;
  try {
    const res = await fetch(`${state.sheetsUrl}?action=getAll`);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.items) {
      state.items = data.items;
      saveLocal();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function pushToSheets(item) {
  if (!state.sheetsUrl) return false;
  try {
    await fetch(state.sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addItem', item }),
      mode: 'no-cors',
    });
    return true;
  } catch {
    return false;
  }
}

async function pushBorrowToSheets(borrow) {
  if (!state.sheetsUrl) return false;
  try {
    await fetch(state.sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addBorrow', borrow }),
      mode: 'no-cors',
    });
    return true;
  } catch {
    return false;
  }
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

window.editQty = function(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const newQty = prompt(`Update quantity for "${item.name}":`, item.qty);
  if (newQty === null) return;
  const parsed = parseInt(newQty);
  if (isNaN(parsed)) { showToast('Invalid quantity'); return; }
  item.qty = parsed;
  saveLocal();
  renderInventory();
  document.getElementById('itemModal').classList.add('hidden');
  showToast('Quantity updated');
};

window.deleteItem = function(id) {
  if (!confirm('Delete this item?')) return;
  state.items = state.items.filter(i => i.id !== id);
  saveLocal();
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
// Polls canvas frames and decodes via ZXing BrowserMultiFormatReader.decodeFromImageUrl
// This approach works on iPhone Safari where the callback API does not.

const cfg = {
  main:   { video: 'scannerVideo',  canvas: 'scannerCanvas',  startBtn: 'startScanBtn', stopBtn: 'stopScanBtn' },
  mini:   { video: 'miniVideo',     canvas: 'miniCanvas',     miniEl: 'miniScanner' },
  borrow: { video: 'borrowVideo',   canvas: 'borrowCanvas',   miniEl: 'borrowMiniScanner' },
};

function setScanStatus(msg) {
  const el = document.getElementById('scanStatus');
  if (el) el.textContent = msg;
}

async function startScan(mode) {
  if (!state.zxing) {
    showToast('Scanner still loading — wait a moment and try again');
    return;
  }

  const c = cfg[mode];
  const videoEl  = document.getElementById(c.video);
  const canvasEl = document.getElementById(c.canvas);
  if (!videoEl || !canvasEl) { showToast('Scanner element missing'); return; }

  stopScan(mode);

  try {
    console.log('Starting scan (' + mode + ')...');
    setScanStatus('Starting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    console.log('✓ Camera stream acquired (' + mode + ')');

    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.muted = true;

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => {
        console.log('✓ Video metadata loaded, playing... (' + mode + ')');
        videoEl.play().then(() => {
          console.log('✓ Video playing (' + mode + ')');
          resolve();
        }).catch(reject);
      };
      setTimeout(() => reject(new Error('Camera timeout')), 10000);
    });

    setScanStatus('Scanning… hold steady');

    if (mode === 'main') {
      state.scanStream = stream;
      const s = document.getElementById(c.startBtn); if (s) s.style.display = 'none';
      const x = document.getElementById(c.stopBtn);  if (x) x.style.display = 'block';
    } else if (mode === 'mini') {
      state.miniScanStream = stream;
      document.getElementById(c.miniEl).classList.remove('hidden');
    } else {
      state.borrowScanStream = stream;
      document.getElementById(c.miniEl).classList.remove('hidden');
    }

    // Use decodeFromVideoElement with continuous scanning
    // This is the simplest ZXing API and works on both Chrome and Safari
    const reader = new ZXing.BrowserMultiFormatReader();
    console.log('✓ ZXing reader created (' + mode + ')');

    // decodeFromVideoElement fires callback repeatedly while active
    reader.decodeFromVideoElement(videoEl, (result, err) => {
      if (result) {
        const code = result.getText();
        console.log('✓ Barcode decoded: ' + code);
        setScanStatus('✓ Got it!');
        reader.reset();
        onScanResult(mode, code);
      } else if (err && !(err instanceof ZXing.NotFoundException)) {
        // Log real errors but not "no barcode found" which fires every frame
        console.warn('ZXing decode error:', err);
      }
      // NotFoundException just means no barcode this frame — ignore it
    });

    const stopper = {
      stop() {
        try { reader.reset(); } catch {}
      }
    };
    if (mode === 'main')        state.scanInterval       = stopper;
    else if (mode === 'mini')   state.miniScanInterval   = stopper;
    else                        state.borrowScanInterval = stopper;

  } catch (err) {
    setScanStatus('');
    if (err.name === 'NotAllowedError') {
      showToast('Camera blocked — go to Settings → Safari → Camera → Allow');
    } else {
      showToast('Camera error: ' + (err.message || err));
    }
  }
}

function onScanResult(mode, code) {
  stopScan(mode);
  if (mode === 'main') {
    showScanResult(lookupBarcode(code), 'scanResult');
    showToast('Scanned: ' + code);
  } else if (mode === 'mini') {
    document.getElementById('f-barcode').value = code;
    showToast('Barcode captured: ' + code);
  } else {
    document.getElementById('b-item').value = code;
    handleBorrowItemLookup(code);
    showToast('Scanned: ' + code);
  }
}

function stopScan(mode) {
  if (mode === 'main') {
    if (state.scanInterval)   { state.scanInterval.stop();   state.scanInterval   = null; }
    if (state.scanStream)     { state.scanStream.getTracks().forEach(t => t.stop()); state.scanStream = null; }
    const v = document.getElementById('scannerVideo'); if (v) v.srcObject = null;
    const s = document.getElementById('startScanBtn'); if (s) s.style.display = 'block';
    const x = document.getElementById('stopScanBtn');  if (x) x.style.display = 'none';
  } else if (mode === 'mini') {
    if (state.miniScanInterval) { state.miniScanInterval.stop(); state.miniScanInterval = null; }
    if (state.miniScanStream)   { state.miniScanStream.getTracks().forEach(t => t.stop()); state.miniScanStream = null; }
    const v = document.getElementById('miniVideo');    if (v) v.srcObject = null;
    const m = document.getElementById('miniScanner'); if (m) m.classList.add('hidden');
  } else if (mode === 'borrow') {
    if (state.borrowScanInterval) { state.borrowScanInterval.stop(); state.borrowScanInterval = null; }
    if (state.borrowScanStream)   { state.borrowScanStream.getTracks().forEach(t => t.stop()); state.borrowScanStream = null; }
    const v = document.getElementById('borrowVideo'); if (v) v.srcObject = null;
    const m = document.getElementById('borrowMiniScanner'); if (m) m.classList.add('hidden');
  }
}

// ── ADD ITEM ──────────────────────────────────
function saveItem() {
  const name = document.getElementById('f-name').value.trim();
  const qty = document.getElementById('f-qty').value.trim();
  if (!name) { showToast('Item name is required'); return; }
  if (qty === '') { showToast('Quantity is required'); return; }

  const item = {
    id: generateId(),
    name,
    barcode: document.getElementById('f-barcode').value.trim(),
    category: document.getElementById('f-category').value.trim(),
    qty: parseInt(qty) || 0,
    minstock: parseInt(document.getElementById('f-minstock').value) || 0,
    location: document.getElementById('f-location').value.trim(),
    keywords: document.getElementById('f-keywords').value.trim(),
    supplier: document.getElementById('f-supplier').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
    created: new Date().toISOString(),
  };

  state.items.push(item);
  saveLocal();
  renderInventory();

  const status = document.getElementById('saveStatus');
  status.textContent = `✓ Saved as ${item.id}`;
  status.className = 'save-status ok';

  // Reset form
  ['f-name','f-barcode','f-category','f-qty','f-minstock','f-location','f-keywords','f-supplier','f-notes']
    .forEach(id => { document.getElementById(id).value = ''; });

  pushToSheets(item).catch(() => {});
  showToast(`${item.name} added (${item.id})`);
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

function recordBorrow() {
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
  state.borrows.push(borrow);
  saveLocal();
  renderBorrows();
  document.getElementById('b-item').value = '';
  document.getElementById('b-name').value = '';
  document.getElementById('b-date').value = '';
  document.getElementById('borrowItemResult').classList.add('hidden');
  pushBorrowToSheets(borrow).catch(() => {});
  showToast(`Borrow recorded for ${item.name}`);
}

function recordReturn() {
  const query = document.getElementById('b-item').value.trim();
  if (!query) { showToast('Enter item barcode or name'); return; }
  const item = lookupBarcode(query);
  if (!item) { showToast('Item not found'); return; }

  const borrow = state.borrows.find(b => b.itemId === item.id && !b.returned);
  if (!borrow) { showToast('No active borrow found for this item'); return; }

  borrow.returned = true;
  borrow.returnDate = new Date().toLocaleDateString('en-AU');
  saveLocal();
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
    const due = b.dueDate ? new Date(b.dueDate) : null;
    const overdue = due && due < today;
    return `<div class="borrow-card">
      <div class="borrow-item">${esc(b.itemName)}</div>
      <div class="borrow-who">Borrowed by: ${esc(b.borrower)}</div>
      <div class="borrow-date ${overdue ? 'borrow-overdue' : ''}">
        Borrowed: ${b.borrowDate} ${b.dueDate ? `· Due: ${b.dueDate}${overdue ? ' ⚠ OVERDUE' : ''}` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── SETUP ─────────────────────────────────────
function openSetup() {
  document.getElementById('sheetsUrl').value = state.sheetsUrl;
  document.getElementById('setupModal').classList.remove('hidden');
  document.getElementById('setupStatus').className = 'save-status hidden';
}

function saveSetup() {
  const url = document.getElementById('sheetsUrl').value.trim();
  state.sheetsUrl = url;
  localStorage.setItem('assettrack_sheets_url', url);
  const s = document.getElementById('setupStatus');
  s.textContent = url ? '✓ Google Sheets URL saved' : 'Cleared — using local storage only';
  s.className = 'save-status ok';
}

async function testConnection() {
  const s = document.getElementById('setupStatus');
  s.textContent = 'Testing…';
  s.className = 'save-status ok';
  const ok = await syncFromSheets();
  if (ok) {
    renderInventory();
    s.textContent = `✓ Connected! Loaded ${state.items.length} items.`;
  } else {
    s.textContent = '✗ Could not connect. Check URL and Apps Script permissions.';
    s.className = 'save-status err';
  }
}

// ── UTIL ──────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INIT ──────────────────────────────────────
async function init() {
  loadLocal();

  // Splash
  setTimeout(() => {
    document.getElementById('splash').classList.add('fade-out');
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
    }, 400);
  }, 1400);

  // Load ZXing in background
  loadZXing().then(ok => {
    if (!ok) console.warn('ZXing failed to load — barcode scanning unavailable');
  });

  renderInventory();
  renderBorrows();

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

  // Add item
  document.getElementById('saveItemBtn').addEventListener('click', saveItem);
  document.getElementById('scanBarcodeBtn').addEventListener('click', () => startScan('mini'));
  document.getElementById('closeMiniScanner').addEventListener('click', () => stopScan('mini'));

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
  document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (!confirm('Clear all local inventory data? This cannot be undone.')) return;
    state.items = []; state.borrows = [];
    saveLocal();
    renderInventory(); renderBorrows();
    document.getElementById('setupModal').classList.add('hidden');
    showToast('All local data cleared');
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
