// ─────────────────────────────────────────────────────────────
//  AssetTrack — Google Apps Script Backend
//  Paste this entire file into script.google.com
//  Then: Deploy → New deployment → Web app
//        Execute as: Me
//        Who has access: Anyone
//  Copy the Web App URL into AssetTrack Settings
// ─────────────────────────────────────────────────────────────

const SHEET_NAME_ITEMS   = 'Items';
const SHEET_NAME_BORROWS = 'Borrows';

// Called when the app does a GET request (e.g. ?action=getAll)
function doGet(e) {
  const action = e.parameter.action || 'getAll';
  try {
    if (action === 'getAll') return jsonResponse({ items: getAllItems(), borrows: getAllBorrows() });
    if (action === 'getItems') return jsonResponse({ items: getAllItems() });
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Called when the app does a POST request
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'addItem')   return jsonResponse(addItem(body.item));
    if (action === 'addBorrow') return jsonResponse(addBorrow(body.borrow));
    if (action === 'updateItem') return jsonResponse(updateItem(body.item));
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── ITEMS ──────────────────────────────────────
const ITEM_HEADERS = ['id','name','barcode','category','qty','minstock','location','keywords','supplier','notes','created'];

function getItemsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME_ITEMS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_ITEMS);
    sheet.appendRow(ITEM_HEADERS);
    sheet.getRange(1, 1, 1, ITEM_HEADERS.length).setFontWeight('bold').setBackground('#1a1a24').setFontColor('#00e5ff');
  }
  return sheet;
}

function getAllItems() {
  const sheet = getItemsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function addItem(item) {
  const sheet = getItemsSheet();
  const row = ITEM_HEADERS.map(h => item[h] ?? '');
  sheet.appendRow(row);
  return { success: true, id: item.id };
}

function updateItem(item) {
  const sheet = getItemsSheet();
  const data = sheet.getDataRange().getValues();
  const idCol = ITEM_HEADERS.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === item.id) {
      const row = ITEM_HEADERS.map(h => item[h] ?? data[r][ITEM_HEADERS.indexOf(h)]);
      sheet.getRange(r + 1, 1, 1, ITEM_HEADERS.length).setValues([row]);
      return { success: true };
    }
  }
  return { error: 'Item not found' };
}

// ── BORROWS ────────────────────────────────────
const BORROW_HEADERS = ['id','itemId','itemName','borrower','borrowDate','dueDate','returned','returnDate'];

function getBorrowsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME_BORROWS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_BORROWS);
    sheet.appendRow(BORROW_HEADERS);
    sheet.getRange(1, 1, 1, BORROW_HEADERS.length).setFontWeight('bold').setBackground('#1a1a24').setFontColor('#00e5ff');
  }
  return sheet;
}

function getAllBorrows() {
  const sheet = getBorrowsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function addBorrow(borrow) {
  const sheet = getBorrowsSheet();
  const row = BORROW_HEADERS.map(h => borrow[h] ?? '');
  sheet.appendRow(row);
  return { success: true, id: borrow.id };
}
