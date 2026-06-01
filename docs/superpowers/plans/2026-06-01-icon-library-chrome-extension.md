# Icon Library Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that lets users browse, search, and copy icons from a nested Google Drive folder hierarchy via a 380px popup.

**Architecture:** Vanilla JS Chrome extension with no build tools. The popup (popup.html/js/css) imports pure helpers from lib/ using ES modules. A minimal service worker (background.js) satisfies MV3. chrome.storage.local persists the Drive file/folder index across browser sessions. Auth tries chrome.identity silent flow first; falls back to launchWebAuthFlow for guest profiles.

**Tech Stack:** Manifest V3 · Vanilla JS (ES modules) · Google Drive API v3 · chrome.identity · chrome.storage.local · Web Clipboard API (ClipboardItem) · Canvas API

---

## File Map

| File | Role |
|---|---|
| `manifest.json` | Extension manifest — permissions, OAuth config, entry points |
| `background.js` | Minimal MV3 service worker |
| `popup.html` | Extension popup — all view sections (auth, configure, loading, main) |
| `popup.css` | Popup styles |
| `popup.js` | Main logic — auth, navigation, search, copy, error handling |
| `lib/utils.js` | Pure helpers: URL parsing, file filtering, time formatting |
| `lib/drive.js` | Drive API v3 wrapper + recursive index builder |
| `tests/utils.test.js` | Unit tests for lib/utils.js (run with Node.js) |
| `tests/drive.test.js` | Unit tests for lib/drive.js buildIndex recursion |
| `package.json` | `{"type":"module"}` — lets Node treat .js as ES modules for tests |
| `icons/icon-{16,48,128}.png` | Extension icons |

---

### Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `package.json`
- Create: `icons/` with placeholder PNGs

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p icons lib tests
```

Expected output: no error, directories created.

- [ ] **Step 2: Create package.json**

```json
{ "type": "module" }
```

- [ ] **Step 3: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Icon Library",
  "version": "1.0.0",
  "description": "Browse and copy icons from your Google Drive library.",
  "permissions": ["identity", "storage", "clipboardWrite"],
  "host_permissions": ["https://www.googleapis.com/*"],
  "oauth2": {
    "client_id": "REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

> **Before going live:** Replace `REPLACE_WITH_YOUR_CLIENT_ID` with the OAuth 2.0 client ID from Google Cloud Console (type: Chrome Extension). See spec for setup steps.

- [ ] **Step 4: Create background.js**

```js
chrome.runtime.onInstalled.addListener(() => {
  console.log('Icon Library installed.');
});
```

- [ ] **Step 5: Add placeholder icon PNGs**

Place any valid PNG files at `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`. The extension will not load in Chrome without them. Any valid PNG works for development — replace with real branded icons before publishing.

If you have ImageMagick installed:
```bash
convert -size 16x16 xc:#111827 icons/icon-16.png
convert -size 48x48 xc:#111827 icons/icon-48.png
convert -size 128x128 xc:#111827 icons/icon-128.png
```

Otherwise, copy any three PNG files and rename them.

- [ ] **Step 6: Verify extension loads in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `iconlib/` directory
4. Extension should appear with no errors. The popup will be blank — that's expected.

- [ ] **Step 7: Commit**

```bash
git add manifest.json background.js package.json icons/
git commit -m "feat: scaffold Chrome extension project"
```

---

### Task 2: Pure Utility Functions

**Files:**
- Create: `lib/utils.js`
- Create: `tests/utils.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils.test.js`:

```js
import { extractFolderIdFromUrl, filterFiles, formatTimeAgo, isCacheStale } from '../lib/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// extractFolderIdFromUrl
console.log('\nextractFolderIdFromUrl');
assert(
  extractFolderIdFromUrl('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'extracts ID from full Drive URL'
);
assert(
  extractFolderIdFromUrl('https://drive.google.com/drive/u/0/folders/1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'extracts ID from Drive URL with /u/0/'
);
assert(
  extractFolderIdFromUrl('1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'returns plain ID unchanged'
);
assert(
  extractFolderIdFromUrl('  1aBcDeFgHiJkLmN  ') === '1aBcDeFgHiJkLmN',
  'trims whitespace from plain ID'
);
assert(
  extractFolderIdFromUrl('not a valid input') === null,
  'returns null for invalid input'
);
assert(
  extractFolderIdFromUrl('short') === null,
  'returns null for string shorter than 10 chars'
);

// filterFiles
console.log('\nfilterFiles');
const files = [
  { id: '1', name: 'ec2.svg', mimeType: 'image/svg+xml', folderId: 'f1', path: 'AWS' },
  { id: '2', name: 'S3-icon.svg', mimeType: 'image/svg+xml', folderId: 'f1', path: 'AWS' },
  { id: '3', name: 'compute-engine.svg', mimeType: 'image/svg+xml', folderId: 'f2', path: 'GCP' },
];
assert(filterFiles(files, 's3').length === 1, 'case-insensitive match');
assert(filterFiles(files, 's3')[0].name === 'S3-icon.svg', 'returns correct file');
assert(filterFiles(files, 'svg').length === 3, 'matches all files containing "svg"');
assert(filterFiles(files, '').length === 3, 'empty query returns all files');
assert(filterFiles(files, 'zzz').length === 0, 'no match returns empty array');

// formatTimeAgo
console.log('\nformatTimeAgo');
const now = Math.floor(Date.now() / 1000);
assert(formatTimeAgo(now - 30) === 'just now', 'under 60s shows "just now"');
assert(formatTimeAgo(now - 90) === '1m ago', '90 seconds shows "1m ago"');
assert(formatTimeAgo(now - 3700) === '1h ago', '3700 seconds shows "1h ago"');
assert(formatTimeAgo(now - 90000) === '1d ago', '90000 seconds shows "1d ago"');

// isCacheStale
console.log('\nisCacheStale');
assert(isCacheStale(now - 90000) === true, 'timestamp 25 hours ago is stale');
assert(isCacheStale(now - 3600) === false, 'timestamp 1 hour ago is not stale');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node tests/utils.test.js
```

Expected: `Error: Cannot find module '../lib/utils.js'`

- [ ] **Step 3: Create lib/utils.js**

```js
export function extractFolderIdFromUrl(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function filterFiles(files, query) {
  if (!query) return files;
  const q = query.toLowerCase();
  return files.filter(f => f.name.toLowerCase().includes(q));
}

export function formatTimeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function isCacheStale(builtAt) {
  return Math.floor(Date.now() / 1000) - builtAt > 86400;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node tests/utils.test.js
```

Expected:
```
extractFolderIdFromUrl
  PASS: extracts ID from full Drive URL
  PASS: extracts ID from Drive URL with /u/0/
  PASS: returns plain ID unchanged
  PASS: trims whitespace from plain ID
  PASS: returns null for invalid input
  PASS: returns null for string shorter than 10 chars
...
6 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add lib/utils.js tests/utils.test.js
git commit -m "feat: add utility functions with tests"
```

---

### Task 3: Drive API Wrapper

**Files:**
- Create: `lib/drive.js`
- Create: `tests/drive.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/drive.test.js`:

```js
import { buildIndex } from '../lib/drive.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

// Mock listChildren returns a nested folder tree:
// root/
//   AWS/ (folder)
//     ec2.svg
//     s3.svg
//   logo.svg
async function mockListChildren(_token, folderId) {
  const tree = {
    'root': [
      { id: 'aws-folder', name: 'AWS', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'logo-file', name: 'logo.svg', mimeType: 'image/svg+xml' },
    ],
    'aws-folder': [
      { id: 'ec2-file', name: 'ec2.svg', mimeType: 'image/svg+xml' },
      { id: 's3-file', name: 's3.svg', mimeType: 'image/svg+xml' },
    ],
  };
  return tree[folderId] || [];
}

console.log('\nbuildIndex');
const index = await buildIndex('fake-token', 'root', mockListChildren);

assert(index.folders.length === 1, 'finds one subfolder');
assert(index.folders[0].id === 'aws-folder', 'subfolder has correct id');
assert(index.folders[0].name === 'AWS', 'subfolder has correct name');
assert(index.folders[0].parentId === 'root', 'subfolder has correct parentId');
assert(index.folders[0].path === 'AWS', 'subfolder has correct path');

assert(index.files.length === 3, 'finds all 3 files across nested folders');

const logo = index.files.find(f => f.id === 'logo-file');
assert(logo !== undefined, 'logo.svg found');
assert(logo.folderId === 'root', 'logo.svg has correct folderId');
assert(logo.path === '', 'root-level file has empty path');

const ec2 = index.files.find(f => f.id === 'ec2-file');
assert(ec2 !== undefined, 'ec2.svg found');
assert(ec2.folderId === 'aws-folder', 'ec2.svg has correct folderId');
assert(ec2.path === 'AWS', 'ec2.svg has correct path');

assert(typeof index.builtAt === 'number', 'builtAt is a number');
assert(index.rootFolderId === 'root', 'rootFolderId matches input');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node tests/drive.test.js
```

Expected: `Error: Cannot find module '../lib/drive.js'`

- [ ] **Step 3: Create lib/drive.js**

```js
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchWithRetry(url, options) {
  const res = await fetch(url, options);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1000));
    const retry = await fetch(url, options);
    if (!retry.ok) throw new DriveError(retry.status, `Drive API error ${retry.status}`);
    return retry;
  }
  if (!res.ok) throw new DriveError(res.status, `Drive API error ${res.status}`);
  return res;
}

export async function listChildren(token, folderId) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType)',
    pageSize: '1000',
  });
  const res = await fetchWithRetry(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files ?? [];
}

export async function getFileContent(token, fileId) {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.text();
}

export async function getFileBlob(token, fileId) {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.blob();
}

const ICON_MIME_TYPES = new Set(['image/svg+xml', 'image/png']);
const ICON_EXTENSIONS = /\.(svg|png)$/i;

export async function buildIndex(token, rootFolderId, listFn = listChildren) {
  const folders = [];
  const files = [];

  async function walk(folderId, pathPrefix) {
    const children = await listFn(token, folderId);
    for (const item of children) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const path = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
        folders.push({ id: item.id, name: item.name, parentId: folderId, path });
        await walk(item.id, path);
      } else if (ICON_MIME_TYPES.has(item.mimeType) || ICON_EXTENSIONS.test(item.name)) {
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          folderId,
          path: pathPrefix,
        });
      }
    }
  }

  await walk(rootFolderId, '');
  return {
    folders,
    files,
    builtAt: Math.floor(Date.now() / 1000),
    rootFolderId,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node tests/drive.test.js
```

Expected:
```
buildIndex
  PASS: finds one subfolder
  PASS: subfolder has correct id
  ...
12 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add lib/drive.js tests/drive.test.js
git commit -m "feat: add Drive API wrapper with buildIndex and tests"
```

---

### Task 4: Popup HTML Shell and CSS

**Files:**
- Create: `popup.html`
- Create: `popup.css`

- [ ] **Step 1: Create popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Icon Library</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>

  <!-- ── Header (always visible) ── -->
  <header id="header" class="hidden">
    <div class="header-left">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </div>
      <span class="app-title">Icon Library</span>
    </div>
    <div class="header-right">
      <span id="sync-badge" class="sync-badge hidden">
        <span class="sync-dot"></span>
        <span id="sync-label"></span>
      </span>
      <button id="btn-settings" class="icon-btn" title="Change Drive folder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
      </button>
    </div>
  </header>

  <!-- ── View: Unauthenticated ── -->
  <div id="view-auth" class="view hidden">
    <div class="center-panel">
      <div class="logo-lg">
        <svg viewBox="0 0 24 24" fill="white" width="24" height="24">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </div>
      <h2>Icon Library</h2>
      <p class="muted">Sign in to browse your Drive icons</p>
      <button id="btn-signin" class="btn-primary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  </div>

  <!-- ── View: Configure root folder ── -->
  <div id="view-configure" class="view hidden">
    <div class="configure-panel">
      <p class="configure-label">Paste your Google Drive folder URL or ID</p>
      <input
        id="input-folder-url"
        class="text-input"
        type="text"
        placeholder="https://drive.google.com/drive/folders/…"
        autocomplete="off"
        spellcheck="false"
      >
      <span id="configure-error" class="input-error hidden"></span>
      <button id="btn-save-folder" class="btn-primary">Connect folder</button>
    </div>
  </div>

  <!-- ── View: Loading (index build) ── -->
  <div id="view-loading" class="view hidden">
    <div id="loading-search" class="search-wrap">
      <div class="search-inner">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input class="search-input" type="text" placeholder="Search all icons…" disabled>
      </div>
    </div>
    <div class="loading-status">
      <span id="loading-label">Loading icons…</span>
    </div>
    <div class="grid-wrap">
      <div class="skeleton-grid">
        <!-- 10 skeleton tiles -->
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
        <div class="skeleton-tile"></div>
      </div>
    </div>
  </div>

  <!-- ── View: Error ── -->
  <div id="view-error" class="view hidden">
    <div class="center-panel">
      <p id="error-message" class="error-text"></p>
      <button id="btn-reconnect" class="btn-secondary">Reconnect</button>
    </div>
  </div>

  <!-- ── View: Main (browse + search) ── -->
  <div id="view-main" class="view hidden">
    <div class="search-wrap">
      <div class="search-inner">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input id="search-input" class="search-input" type="text" placeholder="Search all icons…">
        <button id="btn-clear-search" class="clear-btn hidden" title="Clear search">✕</button>
      </div>
    </div>

    <div id="breadcrumb" class="breadcrumb"></div>

    <div id="content" class="grid-wrap"></div>

    <footer class="popup-footer">
      <span id="footer-count" class="footer-count"></span>
      <span id="footer-action"></span>
    </footer>
  </div>

  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 380px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
  color: #111827;
  font-size: 13px;
  overflow-x: hidden;
}

.hidden { display: none !important; }

/* ── Header ── */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f3f4f6;
}

.header-left { display: flex; align-items: center; gap: 8px; }

.logo {
  width: 24px; height: 24px;
  background: #111827; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.logo-lg {
  width: 44px; height: 44px;
  background: #111827; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
}

.app-title { font-size: 13px; font-weight: 600; color: #111827; }

.header-right { display: flex; align-items: center; gap: 8px; }

.sync-badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; color: #9ca3af;
}

.sync-dot {
  width: 6px; height: 6px;
  border-radius: 50%; background: #10b981;
}

.icon-btn {
  background: none; border: none; cursor: pointer;
  color: #9ca3af; padding: 2px;
  display: flex; align-items: center;
  border-radius: 4px;
  transition: color 0.1s, background 0.1s;
}
.icon-btn:hover { color: #374151; background: #f3f4f6; }

/* ── Centered panels (auth, configure, error) ── */
.center-panel {
  display: flex; flex-direction: column;
  align-items: center; text-align: center;
  padding: 32px 24px;
  gap: 10px;
}

.center-panel h2 { font-size: 15px; font-weight: 600; color: #111827; }
.muted { font-size: 12px; color: #6b7280; }
.error-text { font-size: 12px; color: #dc2626; line-height: 1.5; }

/* ── Configure panel ── */
.configure-panel {
  display: flex; flex-direction: column;
  padding: 16px 14px;
  gap: 8px;
}

.configure-label { font-size: 12px; color: #374151; font-weight: 500; }

.text-input {
  width: 100%; height: 36px;
  border: 1px solid #e5e7eb; border-radius: 7px;
  padding: 0 10px; font-size: 12px; color: #111827;
  background: #f9fafb; outline: none;
}
.text-input:focus { border-color: #6366f1; background: #fff; }

.input-error { font-size: 11px; color: #dc2626; }

/* ── Buttons ── */
.btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  background: #111827; color: #fff;
  border: none; border-radius: 7px;
  padding: 9px 16px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.1s;
}
.btn-primary:hover { background: #1f2937; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 6px;
  background: #f3f4f6; color: #374151;
  border: none; border-radius: 7px;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.1s;
}
.btn-secondary:hover { background: #e5e7eb; }

/* ── Search ── */
.search-wrap { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }

.search-inner { position: relative; display: flex; align-items: center; }

.search-icon { position: absolute; left: 9px; color: #9ca3af; pointer-events: none; }

.search-input {
  width: 100%; height: 32px;
  border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 0 28px 0 30px; font-size: 12px; color: #374151;
  background: #f9fafb; outline: none;
}
.search-input:focus { border-color: #6366f1; background: #fff; }
.search-input::placeholder { color: #c4c9d4; }
.search-input:disabled { opacity: 0.5; cursor: not-allowed; }

.clear-btn {
  position: absolute; right: 8px;
  background: none; border: none; cursor: pointer;
  font-size: 10px; color: #9ca3af; padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.1s;
}
.clear-btn:hover { color: #374151; }

/* ── Loading skeleton ── */
.loading-status {
  padding: 8px 14px 4px;
  font-size: 11px; color: #9ca3af;
}

.skeleton-grid {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 5px; padding: 10px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.skeleton-tile {
  aspect-ratio: 1;
  background: #f3f4f6;
  border-radius: 7px;
  animation: pulse 1.5s ease-in-out infinite;
}

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex; align-items: center; flex-wrap: nowrap;
  gap: 3px; padding: 7px 12px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 11px; overflow-x: auto;
  white-space: nowrap;
}

.bc-item { color: #6b7280; cursor: pointer; }
.bc-item:hover { color: #111827; text-decoration: underline; }
.bc-item.current { color: #111827; font-weight: 600; cursor: default; }
.bc-item.current:hover { text-decoration: none; }
.bc-sep { color: #d1d5db; }
.bc-clear { margin-left: auto; color: #9ca3af; cursor: pointer; font-size: 10px; }
.bc-clear:hover { color: #374151; }

/* ── Folder list ── */
.folder-list { display: flex; flex-direction: column; gap: 1px; }

.folder-row {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: 7px;
  cursor: pointer; transition: background 0.1s;
  margin: 0 2px;
}
.folder-row:hover { background: #f9fafb; }

.folder-icon {
  width: 30px; height: 30px;
  background: #fef9c3; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.folder-name { font-size: 12px; font-weight: 500; color: #374151; }
.folder-count { font-size: 10px; color: #9ca3af; margin-left: auto; }
.folder-chevron { color: #d1d5db; flex-shrink: 0; }

/* ── Icon grid ── */
.grid-wrap { padding: 8px; max-height: 300px; overflow-y: auto; }

.icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }

.icon-tile {
  position: relative; aspect-ratio: 1;
  border-radius: 7px; background: #f9fafb;
  border: 1px solid #f3f4f6;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden;
  transition: background 0.1s, border-color 0.1s;
}
.icon-tile:hover { background: #f0f0ff; border-color: #c7d2fe; }

.icon-tile img {
  width: 28px; height: 28px;
  object-fit: contain; pointer-events: none;
}

.tile-name {
  font-size: 8px; color: #9ca3af; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 3px; left: 0; right: 0;
}

.tile-path {
  font-size: 7px; color: #c4c9d4; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 12px; left: 0; right: 0;
}

.copy-overlay {
  position: absolute; inset: 0;
  background: rgba(99,102,241,0.88);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s;
  border-radius: 6px;
  font-size: 9px; font-weight: 600;
  color: white; letter-spacing: 0.04em; gap: 3px;
}
.icon-tile:hover .copy-overlay { opacity: 1; }
.icon-tile.copying .copy-overlay { opacity: 1; background: rgba(16,185,129,0.9); }

/* ── Footer ── */
.popup-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-top: 1px solid #f3f4f6;
}

.footer-count { font-size: 11px; color: #9ca3af; }

.footer-link {
  font-size: 11px; font-weight: 500; color: #6366f1;
  background: none; border: none; cursor: pointer; padding: 0;
}
.footer-link:hover { text-decoration: underline; }
```

- [ ] **Step 3: Reload the extension and verify the popup opens**

1. Go to `chrome://extensions`, click the reload icon on Icon Library
2. Click the extension icon in the toolbar
3. The popup should open (380px wide, currently blank because popup.js doesn't exist yet)
4. No console errors about missing CSS

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.css
git commit -m "feat: add popup HTML shell and CSS"
```

---

### Task 5: popup.js — Foundation, Auth, and Configuration

**Files:**
- Create: `popup.js`

This task builds popup.js from scratch with: state management, view switching, auth (both silent and interactive), and the first-run folder configuration flow.

- [ ] **Step 1: Create popup.js**

```js
import { extractFolderIdFromUrl } from './lib/utils.js';
import { buildIndex, DriveError } from './lib/drive.js';

// ── State ──────────────────────────────────────────────────────────
const state = {
  token: null,
  index: null,   // { folders, files, builtAt, rootFolderId }
  currentFolderId: null,  // null = root
  breadcrumb: [], // [{ id, name }]
  searchQuery: '',
};

// ── View switching ─────────────────────────────────────────────────
const VIEWS = ['view-auth', 'view-configure', 'view-loading', 'view-error', 'view-main'];

function showView(name) {
  for (const id of VIEWS) {
    document.getElementById(id).classList.toggle('hidden', id !== name);
  }
  const showHeader = name === 'view-main' || name === 'view-loading';
  document.getElementById('header').classList.toggle('hidden', !showHeader);
}

// ── Auth ───────────────────────────────────────────────────────────
async function getSilentToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(chrome.runtime.lastError || !token ? null : token);
    });
  });
}

async function getInteractiveToken() {
  // Try Chrome account first (shows consent screen once)
  const token = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      resolve(chrome.runtime.lastError || !token ? null : token);
    });
  });
  if (token) return token;

  // Fallback: web auth flow for guest profiles
  return webAuthFlow();
}

async function webAuthFlow() {
  const { client_id } = chrome.runtime.getManifest().oauth2;
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth cancelled'));
        return;
      }
      const hash = new URL(redirectedTo).hash.slice(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);
      if (!token) { reject(new Error('No access token in response')); return; }

      // Store guest token (not managed by Chrome identity)
      const expiry = Math.floor(Date.now() / 1000) + expiresIn;
      chrome.storage.local.set({ guestToken: token, guestTokenExpiry: expiry });
      resolve(token);
    });
  });
}

async function loadStoredGuestToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['guestToken', 'guestTokenExpiry'], (result) => {
      const { guestToken, guestTokenExpiry } = result;
      if (guestToken && guestTokenExpiry > Math.floor(Date.now() / 1000)) {
        resolve(guestToken);
      } else {
        resolve(null);
      }
    });
  });
}

// ── Configuration ──────────────────────────────────────────────────
async function loadRootFolderId() {
  return new Promise((resolve) => {
    chrome.storage.local.get('rootFolderId', (r) => resolve(r.rootFolderId ?? null));
  });
}

async function saveRootFolderId(id) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ rootFolderId: id }, resolve);
  });
}

// ── Entry point ────────────────────────────────────────────────────
async function init() {
  // 1. Try silent auth
  let token = await getSilentToken();

  // 2. Try stored guest token
  if (!token) token = await loadStoredGuestToken();

  if (!token) {
    // Show sign-in screen
    showView('view-auth');
    document.getElementById('btn-signin').addEventListener('click', async () => {
      try {
        token = await getInteractiveToken();
        state.token = token;
        await afterAuth();
      } catch (err) {
        showErrorView(`Sign-in failed: ${err.message}`, true);
      }
    });
    return;
  }

  state.token = token;
  await afterAuth();
}

async function afterAuth() {
  const rootFolderId = await loadRootFolderId();
  if (!rootFolderId) {
    showConfigureView();
  } else {
    await loadAndShowIndex(rootFolderId);
  }
}

function showConfigureView() {
  showView('view-configure');

  const input = document.getElementById('input-folder-url');
  const errorEl = document.getElementById('configure-error');
  const btn = document.getElementById('btn-save-folder');

  btn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');
    const folderId = extractFolderIdFromUrl(input.value);
    if (!folderId) {
      errorEl.textContent = 'Invalid URL or folder ID — paste the full Drive folder URL.';
      errorEl.classList.remove('hidden');
      return;
    }
    await saveRootFolderId(folderId);
    await loadAndShowIndex(folderId);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}

document.getElementById('btn-settings').addEventListener('click', () => {
  // Clear rootFolderId and show configure view
  chrome.storage.local.remove(['rootFolderId', 'iconIndex'], () => {
    state.index = null;
    state.token = null;
    showConfigureView();
    // Re-acquire token silently
    getSilentToken().then(t => { if (t) state.token = t; });
  });
});

document.getElementById('btn-reconnect').addEventListener('click', () => {
  getInteractiveToken().then(async (token) => {
    state.token = token;
    await afterAuth();
  }).catch((err) => {
    showErrorView(`Reconnect failed: ${err.message}`, true);
  });
});

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 2: Reload extension and test the sign-in view**

1. Reload extension at `chrome://extensions`
2. Open the popup
3. If you're signed into Chrome with a Google account, you should see the configure view (since no folder is set yet)
4. If you're in a guest profile, you should see the "Sign in with Google" button

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: add popup foundation, auth flow, and folder configuration"
```

---

### Task 6: popup.js — Index Management and Loading State

**Files:**
- Modify: `popup.js` (add index loading functions)

- [ ] **Step 1: Add index management functions to popup.js** (append after the existing code, before `document.addEventListener('DOMContentLoaded', init)`)

```js
// ── Index management ───────────────────────────────────────────────
const CACHE_KEY = 'iconIndex';

async function loadCachedIndex() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CACHE_KEY, (r) => resolve(r[CACHE_KEY] ?? null));
  });
}

async function saveCachedIndex(index) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: index }, resolve);
  });
}

async function loadAndShowIndex(rootFolderId) {
  showView('view-loading');
  updateSyncBadge(null);

  let index = await loadCachedIndex();

  if (index && index.rootFolderId === rootFolderId && !isCacheStale(index.builtAt)) {
    state.index = index;
    renderMain();
    return;
  }

  // Build fresh index
  document.getElementById('loading-label').textContent = 'Loading icons from Drive…';
  try {
    index = await buildIndex(state.token, rootFolderId);
    await saveCachedIndex(index);
    state.index = index;
    renderMain();
  } catch (err) {
    handleDriveError(err, rootFolderId);
  }
}
```

> **Note:** `isCacheStale` is imported from `lib/utils.js`. Add it to the import line at the top of popup.js:

Update the first line of popup.js:
```js
import { extractFolderIdFromUrl, formatTimeAgo, isCacheStale } from './lib/utils.js';
```

- [ ] **Step 2: Add the sync badge updater**

Append to popup.js (before `document.addEventListener`):

```js
function updateSyncBadge(builtAt) {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  if (!builtAt) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  label.textContent = `Synced ${formatTimeAgo(builtAt)}`;
}
```

- [ ] **Step 3: Add error handler for Drive errors**

Append to popup.js (before `document.addEventListener`):

```js
function showErrorView(message, showReconnect = false) {
  showView('view-error');
  document.getElementById('error-message').textContent = message;
  document.getElementById('btn-reconnect').classList.toggle('hidden', !showReconnect);
}

function handleDriveError(err, rootFolderId) {
  if (err instanceof DriveError) {
    if (err.status === 401) {
      // Token expired — clear and re-authenticate
      chrome.storage.local.remove(['guestToken', 'guestTokenExpiry']);
      showErrorView('Session expired. Please reconnect.', true);
    } else if (err.status === 403 || err.status === 404) {
      showErrorView("Can't access Drive folder. Check the folder exists and is shared with your account.", true);
    } else {
      showErrorView('Drive is unavailable, try again shortly.', false);
    }
  } else if (!navigator.onLine) {
    const cached = state.index;
    if (cached) {
      renderMain(); // Show cached data
    } else {
      showErrorView('No cached icons. Connect to the internet and refresh.', false);
    }
  } else {
    showErrorView(`Unexpected error: ${err.message}`, false);
  }
}
```

- [ ] **Step 4: Reload and verify loading state appears**

1. Reload extension
2. Open popup — you should see the configure view
3. Paste a real Drive folder URL and click "Connect folder"
4. The loading skeleton should appear briefly, then either render the main view (if the folder is accessible) or show an error

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: add index loading, caching, and error handling"
```

---

### Task 7: popup.js — Navigation and Rendering

**Files:**
- Modify: `popup.js` (add render functions)

- [ ] **Step 1: Add renderMain and folder/icon rendering to popup.js**

Append to popup.js (before `document.addEventListener`):

```js
// ── Rendering ──────────────────────────────────────────────────────
function renderMain() {
  state.currentFolderId = null;
  state.breadcrumb = [];
  state.searchQuery = '';
  showView('view-main');
  document.getElementById('search-input').value = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  updateSyncBadge(state.index.builtAt);
  renderRoot();
  bindSearchInput();
}

function renderRoot() {
  state.currentFolderId = null;
  renderBreadcrumb([{ id: null, name: 'All icons', isCurrent: true }]);

  const topFolders = state.index.folders.filter(f => f.parentId === state.index.rootFolderId);
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (topFolders.length === 0) {
    // No subfolders — show all files flat
    renderIconGrid(state.index.files, content, false);
    setFooter(`${state.index.files.length} icons`, null, null);
    return;
  }

  const list = document.createElement('div');
  list.className = 'folder-list';

  for (const folder of topFolders) {
    const count = countIconsInFolder(folder.id);
    const hasSubFolders = state.index.folders.some(f => f.parentId === folder.id);
    const countLabel = hasSubFolders ? `${countFolders(folder.id)} folders` : `${count} icons`;
    list.appendChild(makeFolderRow(folder, countLabel));
  }

  content.appendChild(list);

  const total = state.index.files.length;
  const folderCount = topFolders.length;
  setFooter(`${folderCount} folders · ${total} icons total`, null, null);
}

function renderFolder(folderId) {
  state.currentFolderId = folderId;
  const folder = state.index.folders.find(f => f.id === folderId);

  // Build breadcrumb path
  const crumbs = buildCrumbPath(folderId);
  renderBreadcrumb(crumbs);

  const content = document.getElementById('content');
  content.innerHTML = '';

  // Sub-folders first
  const subFolders = state.index.folders.filter(f => f.parentId === folderId);
  if (subFolders.length > 0) {
    const list = document.createElement('div');
    list.className = 'folder-list';
    for (const sub of subFolders) {
      const count = countIconsInFolder(sub.id);
      list.appendChild(makeFolderRow(sub, `${count} icons`));
    }
    content.appendChild(list);
  }

  // Icon grid
  const files = state.index.files.filter(f => f.folderId === folderId);
  if (files.length > 0) {
    renderIconGrid(files, content, false);
  }

  const driveUrl = `https://drive.google.com/drive/folders/${folderId}`;
  setFooter(
    `${files.length} icons${subFolders.length > 0 ? ` · ${subFolders.length} subfolders` : ''}`,
    'Open in Drive →',
    () => chrome.tabs.create({ url: driveUrl })
  );
}

function renderSearch(query) {
  state.searchQuery = query;
  const { filterFiles } = await import('./lib/utils.js'); // already imported at top

  const matched = state.index.files.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  const crumb = document.getElementById('breadcrumb');
  crumb.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'bc-item current';
  span.textContent = `Results for "${query}"`;
  crumb.appendChild(span);
  const clearSpan = document.createElement('span');
  clearSpan.className = 'bc-clear';
  clearSpan.textContent = '✕ Clear';
  clearSpan.addEventListener('click', clearSearch);
  crumb.appendChild(clearSpan);

  const content = document.getElementById('content');
  content.innerHTML = '';
  renderIconGrid(matched, content, true);
  setFooter(`${matched.length} result${matched.length !== 1 ? 's' : ''} for "${query}"`, null, null);
}

// ── Helpers ────────────────────────────────────────────────────────
function countIconsInFolder(folderId) {
  const subFolderIds = getAllSubFolderIds(folderId);
  return state.index.files.filter(f =>
    f.folderId === folderId || subFolderIds.has(f.folderId)
  ).length;
}

function countFolders(folderId) {
  return state.index.folders.filter(f => f.parentId === folderId).length;
}

function getAllSubFolderIds(folderId) {
  const ids = new Set();
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift();
    for (const f of state.index.folders) {
      if (f.parentId === id) { ids.add(f.id); queue.push(f.id); }
    }
  }
  return ids;
}

function buildCrumbPath(folderId) {
  const crumbs = [];
  let current = state.index.folders.find(f => f.id === folderId);
  while (current) {
    crumbs.unshift({ id: current.id, name: current.name });
    const parent = state.index.folders.find(f => f.id === current.parentId);
    current = parent;
  }
  const result = [{ id: null, name: 'All icons' }, ...crumbs];
  result[result.length - 1].isCurrent = true;
  return result;
}

function renderBreadcrumb(crumbs) {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  crumbs.forEach((crumb, i) => {
    const span = document.createElement('span');
    span.textContent = crumb.name;
    span.className = `bc-item${crumb.isCurrent ? ' current' : ''}`;
    if (!crumb.isCurrent) {
      span.addEventListener('click', () => {
        if (crumb.id === null) renderRoot();
        else renderFolder(crumb.id);
      });
    }
    el.appendChild(span);
    if (i < crumbs.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
  });
}

function makeFolderRow(folder, countLabel) {
  const row = document.createElement('div');
  row.className = 'folder-row';
  row.innerHTML = `
    <div class="folder-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="1.8" width="16" height="16">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
    <span class="folder-name">${escapeHtml(folder.name)}</span>
    <span class="folder-count">${countLabel}</span>
    <svg class="folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  `;
  row.addEventListener('click', () => renderFolder(folder.id));
  return row;
}

function renderIconGrid(files, container, showPath) {
  const grid = document.createElement('div');
  grid.className = 'icon-grid';
  for (const file of files) {
    grid.appendChild(makeIconTile(file, showPath));
  }
  container.appendChild(grid);
}

function makeIconTile(file, showPath) {
  const tile = document.createElement('div');
  tile.className = 'icon-tile';
  tile.dataset.fileId = file.id;
  tile.dataset.mimeType = file.mimeType;

  const nameWithoutExt = file.name.replace(/\.(svg|png)$/i, '');
  const driveThumb = `https://drive.google.com/thumbnail?id=${file.id}&sz=w64`;

  tile.innerHTML = `
    <img src="${driveThumb}" alt="${escapeHtml(nameWithoutExt)}" loading="lazy"
         onerror="this.style.display='none'">
    <div class="copy-overlay">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="13" height="13">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy
    </div>
    ${showPath ? `<div class="tile-path">${escapeHtml(file.path)}</div>` : ''}
    <div class="tile-name">${escapeHtml(nameWithoutExt)}</div>
  `;

  tile.addEventListener('click', () => handleCopy(file.id, file.mimeType, tile));
  return tile;
}

function setFooter(countText, actionLabel, actionFn) {
  document.getElementById('footer-count').textContent = countText;
  const actionEl = document.getElementById('footer-action');
  actionEl.innerHTML = '';
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.className = 'footer-link';
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionFn);
    actionEl.appendChild(btn);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

> **Note:** The `renderSearch` function above has an incorrect `await import(...)` — remove that line since `filterFiles` is not used there (the filter is inlined). Replace:
> ```js
> const { filterFiles } = await import('./lib/utils.js'); // already imported at top
> ```
> with just the comment removed (the filter below it is already inline).

- [ ] **Step 2: Fix the renderSearch function** — replace the incorrect import line

The corrected `renderSearch`:

```js
function renderSearch(query) {
  state.searchQuery = query;

  const matched = state.index.files.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  const crumb = document.getElementById('breadcrumb');
  crumb.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'bc-item current';
  span.textContent = `Results for "${query}"`;
  crumb.appendChild(span);
  const clearSpan = document.createElement('span');
  clearSpan.className = 'bc-clear';
  clearSpan.textContent = '✕ Clear';
  clearSpan.addEventListener('click', clearSearch);
  crumb.appendChild(clearSpan);

  const content = document.getElementById('content');
  content.innerHTML = '';
  renderIconGrid(matched, content, true);
  setFooter(`${matched.length} result${matched.length !== 1 ? 's' : ''} for "${query}"`, null, null);
}
```

- [ ] **Step 3: Add search and refresh bindings**

Append to popup.js (before `document.addEventListener`):

```js
function bindSearchInput() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('btn-clear-search');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.classList.toggle('hidden', !q);
    if (q) {
      renderSearch(q);
    } else {
      if (state.currentFolderId) renderFolder(state.currentFolderId);
      else renderRoot();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSearch();
  });

  clearBtn.addEventListener('click', clearSearch);
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  state.searchQuery = '';
  if (state.currentFolderId) renderFolder(state.currentFolderId);
  else renderRoot();
}

async function refreshIndex() {
  const rootFolderId = state.index?.rootFolderId ?? await loadRootFolderId();
  if (!rootFolderId) return;
  showView('view-loading');
  document.getElementById('loading-label').textContent = 'Refreshing icons…';
  try {
    const index = await buildIndex(state.token, rootFolderId);
    await saveCachedIndex(index);
    state.index = index;
    renderMain();
  } catch (err) {
    handleDriveError(err, rootFolderId);
  }
}
```

- [ ] **Step 4: Update setFooter to include a Refresh button at root**

Replace the existing `setFooter` function with this version that adds a Refresh button when viewing the root and no other action is present:

```js
function setFooter(countText, actionLabel, actionFn) {
  document.getElementById('footer-count').textContent = countText;
  const actionEl = document.getElementById('footer-action');
  actionEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'footer-link';
  if (actionLabel && actionFn) {
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionFn);
  } else {
    btn.textContent = '↻ Refresh';
    btn.addEventListener('click', refreshIndex);
  }
  actionEl.appendChild(btn);
}
```

- [ ] **Step 5: Reload and test navigation**

1. Reload extension
2. Paste your Drive folder URL → should see folder list at root
3. Click a folder → breadcrumb should update, icons should appear
4. Click a breadcrumb ancestor → should navigate back

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "feat: add folder navigation and icon grid rendering"
```

---

### Task 8: popup.js — Copy to Clipboard

**Files:**
- Modify: `popup.js` (add copy functions)

- [ ] **Step 1: Add SVG-to-PNG conversion helper to popup.js**

Append to popup.js (before `document.addEventListener`):

```js
// ── Copy ───────────────────────────────────────────────────────────
async function svgToPng(svgText, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG failed to load')); };
    img.src = url;
  });
}
```

- [ ] **Step 2: Add the main copy handler**

Append to popup.js (before `document.addEventListener`):

```js
async function handleCopy(fileId, mimeType, tileEl) {
  if (!navigator.onLine) {
    showTileError(tileEl, "Can't fetch — offline");
    return;
  }

  tileEl.classList.add('copying');
  const overlay = tileEl.querySelector('.copy-overlay');
  const originalText = overlay.lastChild?.textContent?.trim();
  overlay.lastChild.textContent = '…';

  try {
    if (mimeType === 'image/png') {
      const { getFileBlob } = await import('./lib/drive.js');
      const pngBlob = await getFileBlob(state.token, fileId);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } else {
      const { getFileContent } = await import('./lib/drive.js');
      const svgText = await getFileContent(state.token, fileId);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const pngBlob = await svgToPng(svgText);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/svg+xml': svgBlob,
          'image/png': pngBlob,
        }),
      ]);
    }
    showCopiedToast(tileEl);
  } catch (err) {
    handleDriveError(err, state.index?.rootFolderId);
    overlay.lastChild.textContent = originalText ?? 'Copy';
  } finally {
    tileEl.classList.remove('copying');
  }
}

function showCopiedToast(tileEl) {
  const overlay = tileEl.querySelector('.copy-overlay');
  overlay.lastChild.textContent = 'Copied!';
  tileEl.classList.add('copying');
  setTimeout(() => {
    tileEl.classList.remove('copying');
    overlay.lastChild.textContent = 'Copy';
  }, 1500);
}

function showTileError(tileEl, message) {
  const overlay = tileEl.querySelector('.copy-overlay');
  const prev = overlay.lastChild?.textContent;
  overlay.lastChild.textContent = message;
  overlay.style.background = 'rgba(220,38,38,0.88)';
  setTimeout(() => {
    overlay.lastChild.textContent = prev ?? 'Copy';
    overlay.style.background = '';
  }, 2000);
}
```

- [ ] **Step 3: Fix import statements at top of popup.js**

The copy functions use `getFileBlob` and `getFileContent` — these are already exported from `lib/drive.js`. To avoid dynamic imports inside `handleCopy`, update the static import at the top of popup.js:

```js
import { extractFolderIdFromUrl, formatTimeAgo, isCacheStale } from './lib/utils.js';
import { buildIndex, getFileContent, getFileBlob, DriveError } from './lib/drive.js';
```

Then remove the dynamic `await import('./lib/drive.js')` lines inside `handleCopy`, replacing them with direct calls:

```js
async function handleCopy(fileId, mimeType, tileEl) {
  if (!navigator.onLine) {
    showTileError(tileEl, "Can't fetch — offline");
    return;
  }

  tileEl.classList.add('copying');
  const overlay = tileEl.querySelector('.copy-overlay');
  if (overlay.lastChild) overlay.lastChild.textContent = '…';

  try {
    if (mimeType === 'image/png') {
      const pngBlob = await getFileBlob(state.token, fileId);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } else {
      const svgText = await getFileContent(state.token, fileId);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const pngBlob = await svgToPng(svgText);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/svg+xml': svgBlob,
          'image/png': pngBlob,
        }),
      ]);
    }
    showCopiedToast(tileEl);
  } catch (err) {
    handleDriveError(err, state.index?.rootFolderId);
    if (overlay.lastChild) overlay.lastChild.textContent = 'Copy';
  } finally {
    tileEl.classList.remove('copying');
  }
}
```

- [ ] **Step 4: Test copy manually in Chrome**

1. Reload extension
2. Navigate to a folder with SVG icons
3. Click an icon tile
4. The overlay should show "…" then "Copied!" for 1.5 seconds
5. Open a new Slack message or Google Doc and paste — the icon should appear as an image
6. Open VS Code and paste — SVG source code should paste

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: add copy to clipboard (SVG + PNG via ClipboardItem)"
```

---

### Task 9: Drive thumbnail rendering

**Files:**
- Modify: `popup.js` (fix icon thumbnail loading)

Currently icon tiles load thumbnails from `drive.google.com/thumbnail`. This works for images Drive can render, but SVG thumbnails may not load for non-shared files. Add a fallback that renders the SVG inline using an object URL when the `<img>` fails.

- [ ] **Step 1: Update makeIconTile to handle thumbnail failure with SVG inline fetch**

Replace the `makeIconTile` function:

```js
function makeIconTile(file, showPath) {
  const tile = document.createElement('div');
  tile.className = 'icon-tile';
  tile.dataset.fileId = file.id;
  tile.dataset.mimeType = file.mimeType;

  const nameWithoutExt = file.name.replace(/\.(svg|png)$/i, '');

  // Use Drive thumbnail URL — works for most files in Drive
  // On error, fetch SVG content directly and render inline
  const img = document.createElement('img');
  img.alt = nameWithoutExt;
  img.loading = 'lazy';
  img.width = 28;
  img.height = 28;
  img.style.objectFit = 'contain';

  if (file.mimeType === 'image/svg+xml') {
    // Fetch SVG content and create object URL for reliable rendering
    getFileContent(state.token, file.id)
      .then(svgText => {
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
      })
      .catch(() => {
        img.style.display = 'none';
      });
  } else {
    img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w64`;
    img.onerror = () => { img.style.display = 'none'; };
  }

  const overlay = document.createElement('div');
  overlay.className = 'copy-overlay';
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="13" height="13">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    Copy
  `;

  tile.appendChild(img);
  tile.appendChild(overlay);

  if (showPath) {
    const pathEl = document.createElement('div');
    pathEl.className = 'tile-path';
    pathEl.textContent = file.path;
    tile.appendChild(pathEl);
  }

  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = nameWithoutExt;
  tile.appendChild(nameEl);

  tile.addEventListener('click', () => handleCopy(file.id, file.mimeType, tile));
  return tile;
}
```

> **Note:** Fetching SVG content for every visible tile makes one Drive API call per icon when a folder is opened. This is acceptable for folders up to ~50 icons. For large folders (100+), icons load progressively as the `getFileContent` calls resolve. No UX change needed — the `<img>` simply renders when the blob URL is ready.

- [ ] **Step 2: Reload and verify thumbnail rendering**

1. Navigate into a folder with SVG icons
2. Icons should render as images in the tiles (may take a moment to load)
3. Hover confirms copy overlay appears correctly

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: render SVG thumbnails via Drive API content fetch"
```

---

### Task 10: Final wiring and manual end-to-end test

**Files:**
- Modify: `popup.js` (fix any wiring gaps)

- [ ] **Step 1: Verify the complete popup.js import block is correct**

The top of popup.js should be:

```js
import { extractFolderIdFromUrl, formatTimeAgo, isCacheStale } from './lib/utils.js';
import { buildIndex, getFileContent, getFileBlob, DriveError } from './lib/drive.js';
```

- [ ] **Step 2: Run all unit tests**

```bash
node tests/utils.test.js && node tests/drive.test.js
```

Expected: all tests pass with `0 failed`.

- [ ] **Step 3: Full end-to-end test in Chrome**

Test each flow manually:

**First run:**
- [ ] Load extension unpacked → click popup → see sign-in screen (if guest) or configure screen (if signed in)
- [ ] Paste Drive folder URL → click Connect → loading skeleton appears → icon library renders

**Navigation:**
- [ ] See root folder list with correct counts
- [ ] Click a top-level folder → breadcrumb updates → icons/subfolders appear
- [ ] Click a subfolder → breadcrumb shows full path
- [ ] Click "All icons" in breadcrumb → returns to root

**Search:**
- [ ] Type in search box → results filtered instantly → folder path shown beneath each tile
- [ ] Press Escape → search clears, returns to previous view
- [ ] Click ✕ → same result

**Copy:**
- [ ] Click an icon → "…" shows → "Copied!" shows for 1.5s
- [ ] Paste into Slack → icon appears as image
- [ ] Paste into VS Code → SVG source code appears

**Refresh:**
- [ ] Click "↻ Refresh" in footer → loading state → fresh index built → returns to root

**Settings (gear icon):**
- [ ] Click ⚙ → configure view appears → paste new folder URL → new library loads

**Offline:**
- [ ] Disconnect network → browse and search work (cached)
- [ ] Try to copy → tile shows "Can't fetch — offline" message

**Stale cache (manual test):**
- [ ] In DevTools console with extension popup open, run:
  ```js
  chrome.storage.local.get('iconIndex', r => {
    const stale = {...r.iconIndex, builtAt: r.iconIndex.builtAt - 90000};
    chrome.storage.local.set({iconIndex: stale}, () => console.log('cache marked stale'));
  });
  ```
- [ ] Close and reopen popup → should trigger automatic refresh

- [ ] **Step 4: Commit all remaining changes**

```bash
git add popup.js
git commit -m "feat: complete icon library extension — all flows wired"
```

---

## Google Cloud Setup (One-Time)

Before the extension can authenticate with Drive, complete this setup:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → New Project → name it "Icon Library"
2. APIs & Services → Enable APIs → search "Google Drive API" → Enable
3. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: **Chrome Extension**
5. Extension ID: find it at `chrome://extensions` (the 32-character string under the extension name)
6. Click Create → copy the Client ID
7. In `manifest.json`, replace `REPLACE_WITH_YOUR_CLIENT_ID` with the copied Client ID
8. Reload the extension in Chrome

> The first time a user opens the popup after this change, they'll see a single Google consent screen asking to allow read-only Drive access. All subsequent opens are silent.
