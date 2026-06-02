# PWA Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Icon Library Manifest V3 Chrome extension into an installable, static-hosted PWA, retiring the extension.

**Architecture:** Keep the existing UI (`popup.html`/`popup.css`/`popup.js`) and `lib/` unchanged in behavior. Replace the extension-only surface — `chrome.identity` auth, `chrome.storage.local`, the MV3 manifest, and `background.js` — with three new browser modules (`auth.js` GIS token client, `store.js` storage shim, `sw.js` service worker) plus a web app manifest. The icon index moves to IndexedDB so large libraries don't block the main thread.

**Tech Stack:** Plain ES modules (no framework, no build step). Google Identity Services (GIS) browser token client. IndexedDB + localStorage. Service Worker. GitHub Pages hosting.

---

## Spec reference

`docs/superpowers/specs/2026-06-02-pwa-conversion-design.md`

## File structure

| File | Responsibility |
|------|----------------|
| `store.js` (new) | Promise-based key/value store. Routes `iconIndex` → IndexedDB, small keys → localStorage. DI-testable via `makeStore({kv, idb})`. |
| `auth.js` (new) | GIS token client. `getToken()` (cached + silent), `signIn()` (interactive), `signOut()`. Holds `CONFIG.clientId`. |
| `sw.js` (new) | Service worker: cache-first app shell, network-only for Google hosts. |
| `manifest.webmanifest` (new) | Web app manifest for installability. |
| `index.html` (renamed from `popup.html`) | Adds manifest link, GIS script, SW registration. |
| `popup.css` (modify) | Responsive full-window layout instead of fixed 380px popup. |
| `popup.js` (modify) | Route all `chrome.*` calls through `auth.js` / `store.js`; replace `chrome.tabs.create`. |
| `lib/drive.js`, `lib/utils.js` | Unchanged. |
| `background.js` (delete) | Extension-only. |
| `manifest.json` (delete) | Extension-only. |
| `icons/icon-512.png` (new) | 512px icon for install quality. |
| `tests/store.test.js` (new) | Routing/serialization/remove tests with in-memory backends. |
| `README.md` (modify) | Rewrite for PWA install + Web-application OAuth setup. |
| `.nojekyll` (new) | Let GitHub Pages serve files as-is. |

## How to run tests

Tests are zero-dependency Node ESM scripts run directly. There is no test runner; each file prints `PASS`/`FAIL` lines and a summary. Run a single file with:

```bash
node tests/store.test.js
```

Browser-only behavior (GIS popup, service worker, install prompt, layout) cannot be unit-tested in Node — it is verified through the **Manual verification checklist** in Task 11. This is intentional, not deferred work.

---

## Task 1: Storage shim `store.js`

**Files:**
- Create: `store.js`
- Test: `tests/store.test.js`

The store exposes `get(key)`, `set(key, value)`, `remove(key | key[])`, all returning Promises. `iconIndex` routes to IndexedDB (async, large quota); every other key routes to localStorage (small, synchronous is fine). `makeStore({kv, idb})` takes injectable backends so the routing logic is testable in Node with in-memory fakes.

- [ ] **Step 1: Write the failing test**

Create `tests/store.test.js`:

```js
import { makeStore } from '../store.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

function memBackend() {
  const m = new Map();
  return {
    get: (k) => Promise.resolve(m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, v); return Promise.resolve(); },
    remove: (k) => { m.delete(k); return Promise.resolve(); },
    _map: m,
  };
}

console.log('\nmakeStore routing');
const kv = memBackend();
const idb = memBackend();
const store = makeStore({ kv, idb });

await store.set('rootFolderId', 'abc');
await store.set('guestToken', 'tok');
await store.set('iconIndex', { files: [1, 2, 3] });

assert(kv._map.get('rootFolderId') === 'abc', 'small key routes to kv backend');
assert(kv._map.get('guestToken') === 'tok', 'token routes to kv backend');
assert(!kv._map.has('iconIndex'), 'iconIndex does NOT go to kv backend');
assert(idb._map.has('iconIndex'), 'iconIndex routes to idb backend');

assert((await store.get('rootFolderId')) === 'abc', 'reads small key back');
assert((await store.get('iconIndex')).files.length === 3, 'reads iconIndex back from idb');
assert((await store.get('missing')) === null, 'missing key returns null');

await store.remove(['rootFolderId', 'iconIndex']);
assert(!kv._map.has('rootFolderId'), 'remove clears kv key');
assert(!idb._map.has('iconIndex'), 'remove clears idb key');

await store.set('guestToken', 'tok2');
await store.remove('guestToken');
assert(!kv._map.has('guestToken'), 'remove accepts a single string key');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/store.test.js`
Expected: FAIL — `Cannot find module '.../store.js'` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `store.js`:

```js
// Keys large enough to warrant async, high-quota storage go to IndexedDB.
// Everything else is tiny and lives in localStorage.
const INDEXED_KEYS = new Set(['iconIndex']);

const DB_NAME = 'iconlib';
const STORE_NAME = 'kv';

// ── localStorage backend (small values) ───────────────────────────
const localKv = {
  get(key) {
    const raw = localStorage.getItem(key);
    return Promise.resolve(raw == null ? null : JSON.parse(raw));
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return Promise.resolve();
  },
  remove(key) {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

// ── IndexedDB backend (large values) ──────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRequest(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

const idbKv = {
  async get(key) {
    const v = await idbRequest('readonly', (s) => s.get(key));
    return v === undefined ? null : v;
  },
  set(key, value) {
    return idbRequest('readwrite', (s) => s.put(value, key));
  },
  remove(key) {
    return idbRequest('readwrite', (s) => s.delete(key));
  },
};

// ── Router ─────────────────────────────────────────────────────────
export function makeStore({ kv, idb }) {
  const backend = (key) => (INDEXED_KEYS.has(key) ? idb : kv);
  return {
    get(key) {
      return backend(key).get(key);
    },
    set(key, value) {
      return backend(key).set(key, value);
    },
    remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Promise.all(list.map((k) => backend(k).remove(k))).then(() => {});
    },
  };
}

export const store = makeStore({ kv: localKv, idb: idbKv });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/store.test.js`
Expected: PASS — `8 passed, 0 failed` (the `localStorage`/`indexedDB` references are only inside function bodies, never executed in Node, so the import succeeds).

- [ ] **Step 5: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "feat: add store.js storage shim (IndexedDB for index, localStorage for small keys)"
```

---

## Task 2: Route `popup.js` storage through `store.js`

**Files:**
- Modify: `popup.js` (imports; lines 89-99, 162-167, 179-191, 237)

Replace every `chrome.storage.local.*` call with the Promise-based `store` API. There is no Node unit test for `popup.js` (it is DOM-driven); correctness is checked when running the full app in Task 11. Each edit is mechanical.

- [ ] **Step 1: Add the import**

At the top of `popup.js`, after the existing imports (line 2), add:

```js
import { store } from './store.js';
```

- [ ] **Step 2: Replace the configuration accessors (lines 89-99)**

Replace:

```js
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
```

with:

```js
async function loadRootFolderId() {
  return store.get('rootFolderId');
}

async function saveRootFolderId(id) {
  return store.set('rootFolderId', id);
}
```

- [ ] **Step 3: Replace the index cache accessors (lines 179-191)**

Replace:

```js
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
```

with:

```js
const CACHE_KEY = 'iconIndex';

async function loadCachedIndex() {
  return store.get(CACHE_KEY);
}

async function saveCachedIndex(index) {
  return store.set(CACHE_KEY, index);
}
```

- [ ] **Step 4: Replace the settings-button reset (lines 161-167)**

Replace:

```js
document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.storage.local.remove(['rootFolderId', 'iconIndex'], () => {
    state.index = null;
    showConfigureView();
    getSilentToken().then(t => { if (t) state.token = t; });
  });
});
```

with (note: `getSilentToken` is replaced by `getToken` from `auth.js` in Task 3; this version uses `getToken` already):

```js
document.getElementById('btn-settings').addEventListener('click', async () => {
  await store.remove(['rootFolderId', 'iconIndex']);
  state.index = null;
  showConfigureView();
  const t = await getToken();
  if (t) state.token = t;
});
```

- [ ] **Step 5: Replace the 401 token clear (line 237)**

Replace:

```js
      chrome.storage.local.remove(['guestToken', 'guestTokenExpiry']);
```

with:

```js
      await store.remove(['guestToken', 'guestTokenExpiry']);
```

Then ensure the enclosing function is `async`. The function is `handleDriveError(err, rootFolderId)` at line 234 — change its signature to:

```js
async function handleDriveError(err, rootFolderId) {
```

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "refactor: route popup.js storage through store.js shim"
```

---

## Task 3: GIS auth module `auth.js` and wire `popup.js`

**Files:**
- Create: `auth.js`
- Modify: `popup.js` (lines 24-86 auth functions; 101-126 init; 169-176 reconnect; 344-349 chrome.tabs)

`auth.js` wraps the GIS browser token client. `getToken()` returns a cached valid token, else attempts a silent (`prompt: 'none'`) request and resolves `null` on failure. `signIn()` runs an interactive (`prompt: ''`) request — it must be called from a user gesture (button click). Tokens persist via `store.js`.

- [ ] **Step 1: Create `auth.js`**

```js
import { store } from './store.js';

export const CONFIG = {
  // Replace with your Google Cloud "Web application" OAuth client ID (Task 9).
  clientId: 'REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com',
  scope: 'https://www.googleapis.com/auth/drive.readonly',
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

let tokenClient = null;

function ensureTokenClient() {
  if (tokenClient) return tokenClient;
  // google.accounts.oauth2 is provided by the GIS script loaded in index.html.
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: CONFIG.scope,
    callback: () => {}, // replaced per-request below
  });
  return tokenClient;
}

// prompt: 'none' = silent (no UI, fails if interaction needed)
// prompt: ''     = interactive (consent shown only if not already granted)
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    const client = ensureTokenClient();
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      resolve(resp);
    };
    client.error_callback = (err) => reject(new Error(err?.type ?? 'auth_failed'));
    try {
      client.requestAccessToken({ prompt });
    } catch (err) {
      reject(err);
    }
  });
}

async function acquire(prompt) {
  const resp = await requestToken(prompt);
  const expiry = nowSeconds() + (resp.expires_in ?? 3600);
  await store.set('guestToken', resp.access_token);
  await store.set('guestTokenExpiry', expiry);
  return resp.access_token;
}

// Returns a valid token without forcing UI, or null if sign-in is required.
export async function getToken() {
  const token = await store.get('guestToken');
  const expiry = await store.get('guestTokenExpiry');
  if (token && expiry && expiry > nowSeconds()) return token;
  try {
    return await acquire('none');
  } catch {
    return null;
  }
}

// Interactive sign-in. Must be called from a user gesture.
export async function signIn() {
  return acquire('');
}

export async function signOut() {
  const token = await store.get('guestToken');
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  await store.remove(['guestToken', 'guestTokenExpiry']);
}
```

- [ ] **Step 2: Add the import to `popup.js`**

After the `store` import (Task 2, Step 1), add:

```js
import { getToken, signIn, signOut } from './auth.js';
```

- [ ] **Step 3: Delete the old auth functions (lines 24-86)**

Remove the entire `// ── Auth ──` block: `getSilentToken`, `getInteractiveToken`, `webAuthFlow`, and `loadStoredGuestToken`. These are fully replaced by `auth.js`. Keep the `// ── Configuration ──` block that follows.

- [ ] **Step 4: Rewrite `init()` (lines 101-126)**

Replace:

```js
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
```

with:

```js
async function init() {
  let token = await getToken();

  if (!token) {
    showView('view-auth');
    document.getElementById('btn-signin').addEventListener('click', async () => {
      try {
        token = await signIn();
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
```

- [ ] **Step 5: Rewrite the reconnect button (lines 169-176)**

Replace:

```js
document.getElementById('btn-reconnect').addEventListener('click', () => {
  getInteractiveToken().then(async (token) => {
    state.token = token;
    await afterAuth();
  }).catch((err) => {
    showErrorView(`Reconnect failed: ${err.message}`, true);
  });
});
```

with:

```js
document.getElementById('btn-reconnect').addEventListener('click', () => {
  signIn().then(async (token) => {
    state.token = token;
    await afterAuth();
  }).catch((err) => {
    showErrorView(`Reconnect failed: ${err.message}`, true);
  });
});
```

- [ ] **Step 6: Replace `chrome.tabs.create` (line 348)**

Replace:

```js
    () => chrome.tabs.create({ url: driveUrl })
```

with:

```js
    () => window.open(driveUrl, '_blank', 'noopener')
```

- [ ] **Step 7: Verify no `chrome.*` references remain**

Run: `grep -n "chrome\." popup.js`
Expected: no output (empty). If anything prints, replace it before continuing.

- [ ] **Step 8: Commit**

```bash
git add auth.js popup.js
git commit -m "feat: add GIS auth module, remove all chrome.* extension APIs from popup.js"
```

---

## Task 4: Web app manifest

**Files:**
- Create: `manifest.webmanifest`

- [ ] **Step 1: Create `manifest.webmanifest`**

```json
{
  "name": "Icon Library",
  "short_name": "Icons",
  "description": "Browse and copy icons from your Google Drive library.",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": [
    { "src": "icons/icon-48.png", "sizes": "48x48", "type": "image/png" },
    { "src": "icons/icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add manifest.webmanifest
git commit -m "feat: add web app manifest for installability"
```

---

## Task 5: 512px icon

**Files:**
- Create: `icons/icon-512.png`

- [ ] **Step 1: Generate the 512px icon from the existing 128px icon**

Run (macOS `sips`):

```bash
sips -z 512 512 icons/icon-128.png --out icons/icon-512.png
```

Expected: prints the output path; `icons/icon-512.png` now exists.

- [ ] **Step 2: Verify dimensions**

Run: `sips -g pixelWidth -g pixelHeight icons/icon-512.png`
Expected: `pixelWidth: 512` and `pixelHeight: 512`.

- [ ] **Step 3: Commit**

```bash
git add icons/icon-512.png
git commit -m "feat: add 512px PWA install icon"
```

---

## Task 6: `index.html` (rename + PWA wiring)

**Files:**
- Rename: `popup.html` → `index.html`
- Modify: `index.html` (`<head>` and end of `<body>`)

- [ ] **Step 1: Rename the file**

Run:

```bash
git mv popup.html index.html
```

- [ ] **Step 2: Add PWA + GIS tags to `<head>`**

In `index.html`, replace the existing head block:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Icon Library</title>
  <link rel="stylesheet" href="popup.css">
</head>
```

with:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Icon Library</title>
  <meta name="theme-color" content="#111827">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/icon-128.png">
  <link rel="stylesheet" href="popup.css">
  <script src="https://accounts.google.com/gsi/client" async></script>
</head>
```

- [ ] **Step 3: Add service-worker registration before the closing `</body>`**

In `index.html`, replace:

```html
  <script type="module" src="popup.js"></script>
</body>
```

with:

```html
  <script type="module" src="popup.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
      });
    }
  </script>
</body>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: rename popup.html to index.html, wire manifest, GIS, and SW"
```

---

## Task 7: Service worker `sw.js`

**Files:**
- Create: `sw.js`

Cache-first for the app shell so the app is installable and loads instantly offline. Network-only for Google hosts (Drive API, thumbnails, GIS) so tokens and live data are never cached.

- [ ] **Step 1: Create `sw.js`**

```js
const CACHE = 'iconlib-shell-v1';
const SHELL = [
  '.',
  'index.html',
  'popup.css',
  'popup.js',
  'auth.js',
  'store.js',
  'lib/drive.js',
  'lib/utils.js',
  'manifest.webmanifest',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache Google hosts: Drive API, thumbnails, and GIS must always be live.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('google.com') || url.hostname.endsWith('gstatic.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: Sanity-check the file parses as JS**

Run: `node --check sw.js`
Expected: no output (exit 0). `self`/`caches` are runtime globals; `--check` only validates syntax.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "feat: add service worker (cache-first shell, network-only for Google hosts)"
```

---

## Task 8: Delete extension-only files

**Files:**
- Delete: `background.js`, `manifest.json`

- [ ] **Step 1: Remove the files**

Run:

```bash
git rm background.js manifest.json
```

- [ ] **Step 2: Confirm nothing references them**

Run: `grep -rn "background.js\|manifest.json" index.html popup.js auth.js store.js sw.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove extension-only background.js and manifest.json"
```

---

## Task 9: Responsive layout

**Files:**
- Modify: `popup.css` (lines 3-10, the `body` rule)

The popup was a fixed 380px column. In a standalone PWA window it should center with a comfortable max width and fill the viewport height; the icon grid then naturally shows more columns.

- [ ] **Step 1: Update the `body` rule**

Replace:

```css
body {
  width: 380px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
  color: #111827;
  font-size: 13px;
  overflow-x: hidden;
}
```

with:

```css
body {
  width: 100%;
  max-width: 720px;
  min-height: 100vh;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fff;
  color: #111827;
  font-size: 13px;
  overflow-x: hidden;
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.css
git commit -m "style: responsive full-window layout for PWA"
```

---

## Task 10: Hosting config and README

**Files:**
- Create: `.nojekyll`
- Modify: `README.md`

- [ ] **Step 1: Add `.nojekyll`**

GitHub Pages runs Jekyll by default, which ignores files/folders it considers special. `.nojekyll` disables that so every file is served verbatim.

Run:

```bash
touch .nojekyll
```

- [ ] **Step 2: Rewrite `README.md`**

Replace the entire contents of `README.md` with:

```markdown
# Icon Library

An installable Progressive Web App (PWA) to browse, search, and copy icons stored in a Google Drive folder.

## What it does

- **Browse** icons organised in nested Google Drive folders
- **Search** by filename across all folders instantly
- **Copy** any icon to the clipboard with one click — pastes as an image in Slack, Notion, Figma, email, etc., and as SVG source in code editors
- **Installable** — add it to your desktop/dock from Chrome, runs in its own window
- **Caches** your folder index in the browser (IndexedDB) so subsequent opens are instant, even for very large libraries

## Prerequisites

- A Chromium browser (Chrome / Edge) — for the install prompt and clipboard support
- A Google account with access to the Drive folder containing your icons
- A Google Cloud project with the Drive API enabled (one-time setup, below)

## One-time Google Cloud setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (e.g. "Icon Library").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
4. Set **Application type** to **Web application**.
5. Under **Authorised JavaScript origins**, add the origin where the app is hosted, e.g. `https://npalasseriattw.github.io`.
6. Click **Create** and copy the **Client ID**.
7. Paste it into `auth.js` as `CONFIG.clientId`.

## Hosting (GitHub Pages)

1. Push this repository to GitHub.
2. **Settings → Pages** → set **Source** to deploy from the `main` branch (root).
3. The app will be served at `https://<user>.github.io/<repo>/` — this must match the authorised origin above.

## Using the app

1. Open the hosted URL in Chrome.
2. Click the install icon in the address bar (or **⋮ → Install Icon Library**) to add it as an app.
3. Click **Sign in**, authorise Drive read-only access.
4. Paste the URL of your Drive icons folder when prompted.
5. Browse, search, and click any icon to copy it.

## Notes

- Sign-in uses Google Identity Services entirely in the browser — no backend, no stored secrets. Access tokens last about an hour; re-authorising is usually a single click.
- The icon index is cached in IndexedDB; use the **↻ Refresh** action to re-sync after adding icons in Drive.
```

- [ ] **Step 3: Commit**

```bash
git add .nojekyll README.md
git commit -m "docs: rewrite README for PWA install and Web-application OAuth setup"
```

---

## Task 11: Manual verification

**Files:** none (verification only)

Browser-only behavior cannot run in Node. Serve the app locally over a real origin and walk the checklist. Localhost is treated as a secure context, so service workers, clipboard, and GIS all work.

> Note: the GIS client ID's authorised origins (Task 9) must include the origin you test from. Add `http://localhost:8000` as an authorised JavaScript origin for local testing, in addition to the GitHub Pages origin.

- [ ] **Step 1: Serve locally**

Run: `python3 -m http.server 8000`
Then open `http://localhost:8000/` in Chrome.

- [ ] **Step 2: Walk the checklist** (tick each)

  - [ ] DevTools → Application → Manifest shows no errors; icons listed.
  - [ ] DevTools → Application → Service Workers shows `sw.js` activated.
  - [ ] An **Install** affordance appears in the address bar.
  - [ ] Clicking **Sign in** opens the Google consent popup and returns a token.
  - [ ] Icons load; folder tree and breadcrumb render.
  - [ ] Clicking an icon copies it (paste an SVG into a doc as image, into an editor as source; paste a PNG icon as image).
  - [ ] A large folder (~10k icons) loads without freezing; the **Show more** pagination works.
  - [ ] Reload the page with DevTools → Network set to **Offline**: the app shell still loads (Drive calls fail gracefully with the existing offline messaging).
  - [ ] DevTools → Application → IndexedDB → `iconlib` → `kv` contains the `iconIndex` entry; `localStorage` holds `guestToken` / `rootFolderId` (not the index).
  - [ ] **Settings** (reset) returns to the configure view; **Refresh** re-syncs.

- [ ] **Step 3: Confirm the Node test suite still passes**

Run: `node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js`
Expected: all three print `0 failed`.

---

## Self-review notes

- **Spec coverage:** auth rewrite (Task 3), storage split with IndexedDB for the index (Tasks 1-2), web manifest (Task 4), 512 icon (Task 5), index.html + GIS + SW registration (Task 6), service worker (Task 7), chrome.* removal incl. `chrome.tabs.create` (Tasks 2-3), responsive layout (Task 9), hosting + Web OAuth client + README (Task 10), testing + scale check (Task 11) — all spec sections map to a task.
- **Scale:** Drive pagination and grid lazy-loading are untouched (verified in Task 11, Step 2); the only conversion-introduced risk (sync localStorage for a multi-MB index) is removed by routing `iconIndex` to IndexedDB.
- **Type consistency:** `store.get/set/remove`, `makeStore({kv, idb})`, and `getToken/signIn/signOut` are used with identical signatures everywhere they appear.
```
