# AssetTrack — Setup Guide

## Step 1: Upload files to GitHub

1. Go to [github.com](https://github.com) and sign in
2. Open your `invassettrack` repository
3. Click **Add file → Upload files**
4. Drag all these files in:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `sw.js`
5. Click **Commit changes**

Your app will be live at:
`https://mctech-switch.github.io/invassettrack`

---

## Step 2: Add to iPhone Home Screen

1. Open Safari on your iPhone
2. Go to `https://mctech-switch.github.io/invassettrack`
3. Tap the **Share** button (box with arrow)
4. Scroll down and tap **Add to Home Screen**
5. Name it **AssetTrack** and tap **Add**

It will appear on your home screen and open fullscreen like a real app.

---

## Step 3 (Optional): Connect Google Sheets

This lets your inventory sync across devices. Without it, data is saved on-device only.

### Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it `AssetTrack Inventory`

### Set up the Apps Script backend

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code
3. Paste the entire contents of `google-apps-script.js`
4. Click **Save** (floppy disk icon)
5. Click **Deploy → New deployment**
6. Set type to **Web app**
7. Set **Execute as**: Me
8. Set **Who has access**: Anyone
9. Click **Deploy**
10. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`)

### Connect in the app

1. Open AssetTrack on your phone
2. Tap the **⚙️ Settings** icon (top right)
3. Paste the Web App URL
4. Tap **Save & Connect**
5. Tap **Test Connection** — it should say "Connected!"

---

## App Features

| Feature | How to use |
|---------|------------|
| **Add item** | Tap the + tab, fill in details |
| **Scan barcode** | Tap Scan tab → Start Camera |
| **Scan while adding** | Tap the barcode icon on the Add Item form |
| **Search** | Type in the search bar on Inventory tab |
| **Filter low stock** | Tap the "⚠ Low Stock" chip |
| **Record borrow** | Borrow tab → fill in item and borrower name |
| **Record return** | Borrow tab → enter item → Return button |
| **Update quantity** | Tap any item → Update Qty |

---

## Troubleshooting

**Camera won't start on iPhone**
- Must open in Safari (not Chrome)
- Must be on HTTPS (GitHub Pages is HTTPS ✓)
- Go to Settings → Safari → Camera → Allow

**Google Sheets not syncing**
- Make sure "Who has access" is set to "Anyone" in Apps Script deployment
- Re-deploy after any changes to the script (create a new deployment)
- Test the URL directly in your browser — it should return JSON

**App not updating after changes**
- Hard refresh: hold reload button in Safari → Reload without Content Blockers
- Or clear cache in Settings → Safari → Clear History and Website Data
