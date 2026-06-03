# Local Thumbnail Cache + Tile Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache fetched icon bytes per-browser so repeat/offline views are instant (Drive stays the source of truth, nothing committed to git), and make tiles more legible (bigger icons, darker bold labels).

**Architecture:** A new `thumb-cache.js` wraps an IndexedDB object store keyed by `fileId`, validated against the file's Drive `modifiedTime` so it auto-refreshes when an icon changes. `lib/drive.js` carries `modifiedTime` into the index. `popup.js`'s `makeIconTile` becomes cache-first (check cache → hit renders instantly, miss fetches from Drive then stores) for both SVG and PNG. CSS enlarges icons and darkens labels.

**Tech Stack:** Plain ES modules, no build step. IndexedDB. Zero-dependency Node test scripts (`node tests/<file>.test.js`) with a hand-rolled `assert`.

---

## Spec reference

`docs/superpowers/specs/2026-06-03-icon-cache-and-tile-styling-design.md`

This plan builds on branch `configurable-page-size` (full-width grid + page-size selector, already committed). Work on that branch or a branch off it.

## File structure

| File | Responsibility |
|------|----------------|
| `lib/drive.js` (modify) | Add `modifiedTime` to the files query and to each index file record. |
| `tests/drive.test.js` (modify) | Assert `modifiedTime` is carried through `buildIndex`. |
| `thumb-cache.js` (new) | IndexedDB cache of icon bytes keyed by `fileId`, validated by `modifiedTime`. DI-testable via `makeThumbCache({get, put})`. |
| `tests/thumb-cache.test.js` (new) | Routing/validation tests with an in-memory backend. |
| `popup.js` (modify) | `makeIconTile` becomes cache-first for SVG + PNG; remove duplicate inline icon sizing. |
| `popup.css` (modify) | 40px icons, dark bold labels, grid min column 96px. |
| `sw.js` (modify) | Bump cache `v3→v4`, add `thumb-cache.js` to the precache shell. |

## How to run tests

Zero-dependency Node scripts, run directly:

```bash
node tests/thumb-cache.test.js
node tests/drive.test.js
```

Browser-only behavior (IndexedDB at runtime, rendering, offline) is verified through the manual checklist in Task 6 — `thumb-cache.js`'s real IndexedDB backend cannot run in Node, exactly like `store.js`/`auth.js`. Its routing/validation logic IS unit-tested via dependency injection.

---

## Task 1: Carry `modifiedTime` through the Drive index

**Files:**
- Modify: `lib/drive.js` (the `listChildren` query fields, and the file record in `buildIndex`)
- Test: `tests/drive.test.js`

`modifiedTime` is the freshness signal the cache compares against. It must travel from the Drive API response into each file record in the index.

- [ ] **Step 1: Update the test to expect `modifiedTime`**

In `tests/drive.test.js`, add `modifiedTime` to the mock file entries. Replace the `mockListChildren` tree (lines 18-28) with:

```js
  const tree = {
    'root': [
      { id: 'aws-folder', name: 'AWS', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'logo-file', name: 'logo.svg', mimeType: 'image/svg+xml', modifiedTime: '2026-01-01T00:00:00.000Z' },
    ],
    'aws-folder': [
      { id: 'ec2-file', name: 'ec2.svg', mimeType: 'image/svg+xml', modifiedTime: '2026-02-02T00:00:00.000Z' },
      { id: 's3-file', name: 's3.svg', mimeType: 'image/svg+xml', modifiedTime: '2026-03-03T00:00:00.000Z' },
    ],
  };
```

Then add these assertions immediately after the existing `ec2.path` assertion (after line 50, before the `builtAt` assertion):

```js
assert(logo.modifiedTime === '2026-01-01T00:00:00.000Z', 'logo.svg carries modifiedTime');
assert(ec2.modifiedTime === '2026-02-02T00:00:00.000Z', 'ec2.svg carries modifiedTime');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/drive.test.js`
Expected: FAIL — `logo.svg carries modifiedTime` (and ec2) fail because `buildIndex` doesn't include `modifiedTime` yet.

- [ ] **Step 3: Add `modifiedTime` to the query and the index record**

In `lib/drive.js`, find the `listChildren` query fields (currently):

```js
      fields: 'nextPageToken,files(id,name,mimeType)',
```

Replace with:

```js
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
```

Then in `buildIndex`, find the file record push (currently):

```js
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          folderId,
          path: pathPrefix,
        });
```

Replace with:

```js
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          modifiedTime: item.modifiedTime,
          folderId,
          path: pathPrefix,
        });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/drive.test.js`
Expected: PASS — all assertions including the two new `modifiedTime` ones (16 passed, 0 failed).

- [ ] **Step 5: Commit**

```bash
git add lib/drive.js tests/drive.test.js
git commit -m "feat: carry modifiedTime through the Drive index for cache freshness"
```

---

## Task 2: `thumb-cache.js` — IndexedDB icon-bytes cache

**Files:**
- Create: `thumb-cache.js`
- Test: `tests/thumb-cache.test.js`

A dedicated IndexedDB store (`thumbs`, separate DB from `store.js`) holding `{ modifiedTime, type, data }` per `fileId`. `getThumb` returns the record only when the stored `modifiedTime` matches the caller's — otherwise a miss. The cache is an optimization: all errors swallow to null/no-op so a miss always falls back to a live fetch. `makeThumbCache({get, put})` injects the backend so the validation logic is testable in Node.

- [ ] **Step 1: Write the failing test**

Create `tests/thumb-cache.test.js`:

```js
import { makeThumbCache } from '../thumb-cache.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

function memBackend() {
  const m = new Map();
  return {
    get: (id) => Promise.resolve(m.has(id) ? m.get(id) : null),
    put: (id, record) => { m.set(id, record); return Promise.resolve(); },
    _map: m,
  };
}

console.log('\nthumbCache');
const backend = memBackend();
const cache = makeThumbCache(backend);

// store + hit on matching modifiedTime
await cache.putThumb('a', 'T1', 'image/svg+xml', '<svg/>');
const hit = await cache.getThumb('a', 'T1');
assert(hit !== null, 'returns a record on modifiedTime match');
assert(hit.data === '<svg/>', 'record carries the stored data');
assert(hit.type === 'image/svg+xml', 'record carries the stored type');

// miss on modifiedTime mismatch (icon changed in Drive)
assert((await cache.getThumb('a', 'T2')) === null, 'returns null when modifiedTime differs');

// miss on unknown key
assert((await cache.getThumb('missing', 'T1')) === null, 'returns null for unknown key');

// getThumb swallows backend errors to null
const throwing = { get: () => Promise.reject(new Error('idb down')), put: () => Promise.resolve() };
assert((await makeThumbCache(throwing).getThumb('a', 'T1')) === null, 'getThumb swallows backend errors');

// putThumb swallows backend errors (no throw)
let threw = false;
try {
  await makeThumbCache({ get: () => Promise.resolve(null), put: () => Promise.reject(new Error('quota')) })
    .putThumb('a', 'T1', 'image/png', new Uint8Array());
} catch { threw = true; }
assert(!threw, 'putThumb swallows backend errors');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/thumb-cache.test.js`
Expected: FAIL — `Cannot find module '.../thumb-cache.js'`.

- [ ] **Step 3: Write `thumb-cache.js`**

```js
// Per-browser cache of fetched icon bytes, keyed by Drive fileId and validated
// against the file's modifiedTime so it auto-refreshes when an icon changes.
// This is an optimization only — every miss/error falls back to a live fetch.
const DB_NAME = 'iconlib-thumbs';
const STORE_NAME = 'thumbs';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbRequest(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

const idbBackend = {
  async get(id) {
    const v = await idbRequest('readonly', (s) => s.get(id));
    return v === undefined ? null : v;
  },
  put(id, record) {
    return idbRequest('readwrite', (s) => s.put(record, id));
  },
};

export function makeThumbCache({ get, put }) {
  return {
    // Returns { modifiedTime, type, data } when the cached entry's modifiedTime
    // matches; otherwise null (miss). Never throws.
    async getThumb(fileId, modifiedTime) {
      try {
        const rec = await get(fileId);
        if (rec && rec.modifiedTime === modifiedTime) return rec;
        return null;
      } catch {
        return null;
      }
    },
    // Stores bytes for a file. Never throws (cache is best-effort).
    async putThumb(fileId, modifiedTime, type, data) {
      try {
        await put(fileId, { modifiedTime, type, data });
      } catch {
        /* best-effort cache; ignore quota/abort/unavailable */
      }
    },
  };
}

export const thumbCache = makeThumbCache(idbBackend);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/thumb-cache.test.js`
Expected: PASS — `6 passed, 0 failed` (the `indexedDB` global is only touched inside function bodies, so importing `makeThumbCache` works in Node).

- [ ] **Step 5: Commit**

```bash
git add thumb-cache.js tests/thumb-cache.test.js
git commit -m "feat: add thumb-cache.js (IndexedDB icon-bytes cache, modifiedTime-validated)"
```

---

## Task 3: Make `makeIconTile` cache-first (SVG + PNG)

**Files:**
- Modify: `popup.js` (the import block; `makeIconTile` lines ~483-516)

The lazy-load path becomes: on intersect, check the cache; hit → render instantly with no network; miss → fetch from Drive (SVG via `getFileContent`, PNG via `getFileBlob`), store, then render. PNG tiles move off the eager `img.src=…thumbnail…` onto this same path so they cache and work offline. The duplicate inline icon sizing is removed (size is set in CSS — Task 4).

- [ ] **Step 1: Add imports**

`getFileBlob` is already exported from `lib/drive.js`. Update the existing drive import line in `popup.js`:

```js
import { buildIndex, getFileContent, getFileBlob, DriveError } from './lib/drive.js';
```

(If `getFileBlob` is already in that import, leave it.) Then add a new import after the `auth.js` import:

```js
import { thumbCache } from './thumb-cache.js';
```

- [ ] **Step 2: Remove the duplicate inline icon sizing**

In `makeIconTile`, find:

```js
  const img = document.createElement('img');
  img.alt = nameWithoutExt;
  img.width = 28;
  img.height = 28;
  img.style.objectFit = 'contain';
```

Replace with (size and object-fit come from CSS now):

```js
  const img = document.createElement('img');
  img.alt = nameWithoutExt;
```

- [ ] **Step 3: Replace the SVG/PNG branch with a unified cache-first loader**

In `makeIconTile`, find this entire block:

```js
  if (file.mimeType === 'image/svg+xml') {
    // Lazy-load: only fetch SVG content when tile scrolls into view,
    // and cap concurrent requests via semaphore to avoid flooding Drive API.
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      thumbSem.acquire().then(() =>
        getFileContent(state.token, file.id)
          .then(svgText => {
            const blob = new Blob([svgText], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            img.onload = () => URL.revokeObjectURL(url);
            img.onerror = () => { URL.revokeObjectURL(url); img.style.display = 'none'; };
            img.src = url;
          })
          // Hide the tile on any fetch failure. A 401 here is intentionally
          // swallowed rather than surfaced — the next browse/copy action routes
          // through handleDriveError and offers Reconnect, so we avoid spamming
          // the error view from dozens of concurrent thumbnail loads.
          .catch(() => { img.style.display = 'none'; })
          .finally(() => thumbSem.release())
      );
    }, { rootMargin: '100px' });
    observer.observe(tile);
  } else {
    img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w64`;
    img.onerror = () => { img.style.display = 'none'; };
  }
```

Replace it with:

```js
  // Render an icon from its bytes: SVG data is text, PNG data is a Blob.
  function renderBytes(type, data) {
    const blob = type === 'image/svg+xml' ? new Blob([data], { type }) : data;
    const url = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => { URL.revokeObjectURL(url); img.style.display = 'none'; };
    img.src = url;
  }

  // Lazy-load when the tile scrolls into view. Cache-first: a hit renders with
  // no network; a miss fetches from Drive, stores the bytes, then renders.
  // Concurrent misses are capped by thumbSem to avoid flooding the Drive API.
  const observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    thumbSem.acquire().then(async () => {
      try {
        const cached = await thumbCache.getThumb(file.id, file.modifiedTime);
        if (cached) {
          renderBytes(cached.type, cached.data);
          return;
        }
        const data = file.mimeType === 'image/svg+xml'
          ? await getFileContent(state.token, file.id)
          : await getFileBlob(state.token, file.id);
        await thumbCache.putThumb(file.id, file.modifiedTime, file.mimeType, data);
        renderBytes(file.mimeType, data);
      } catch {
        // Hide the tile on any fetch failure. A 401 here is intentionally
        // swallowed rather than surfaced — the next browse/copy action routes
        // through handleDriveError and offers Reconnect, so we avoid spamming
        // the error view from dozens of concurrent thumbnail loads.
        img.style.display = 'none';
      } finally {
        thumbSem.release();
      }
    });
  }, { rootMargin: '100px' });
  observer.observe(tile);
```

- [ ] **Step 4: Verify syntax and that nothing regressed**

Run: `node --check popup.js`
Expected: no output (exit 0).

Run: `node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js && node tests/thumb-cache.test.js`
Expected: all report `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: cache-first icon loading for SVG and PNG via thumb-cache"
```

---

## Task 4: Tile styling — bigger icons, readable labels

**Files:**
- Modify: `popup.css` (`.icon-tile img`, `.tile-name`, `.tile-path`, `.icon-grid`, `.skeleton-grid`)

- [ ] **Step 1: Enlarge the icon image**

In `popup.css`, find:

```css
.icon-tile img {
  width: 28px; height: 28px;
  object-fit: contain; pointer-events: none;
}
```

Replace with:

```css
.icon-tile img {
  width: 40px; height: 40px;
  object-fit: contain; pointer-events: none;
}
```

- [ ] **Step 2: Darken and bolden the label**

In `popup.css`, find:

```css
.tile-name {
  font-size: 8px; color: #9ca3af; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 3px; left: 0; right: 0;
}
```

Replace with:

```css
.tile-name {
  font-size: 10px; color: #1f2937; font-weight: 600; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 3px; left: 0; right: 0;
}
```

- [ ] **Step 3: Make the search-result sub-label readable**

In `popup.css`, find:

```css
.tile-path {
  font-size: 7px; color: #c4c9d4; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 12px; left: 0; right: 0;
}
```

Replace with:

```css
.tile-path {
  font-size: 9px; color: #6b7280; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 12px; left: 0; right: 0;
}
```

- [ ] **Step 4: Widen the grid min column so the larger tile content fits**

In `popup.css`, find:

```css
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
}
```

Replace with:

```css
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
```

Then find:

```css
.skeleton-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px; padding: 12px;
}
```

Replace with:

```css
.skeleton-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px; padding: 12px;
}
```

- [ ] **Step 5: Commit**

```bash
git add popup.css
git commit -m "style: 40px icons, dark bold labels, wider grid columns"
```

---

## Task 5: Service worker — cache bump + precache thumb-cache.js

**Files:**
- Modify: `sw.js` (cache name and `SHELL` list)

- [ ] **Step 1: Bump the cache version**

In `sw.js`, find:

```js
const CACHE = 'iconlib-shell-v3';
```

Replace with:

```js
const CACHE = 'iconlib-shell-v4';
```

- [ ] **Step 2: Add `thumb-cache.js` to the precache shell**

In `sw.js`, find:

```js
  'auth.js',
  'store.js',
```

Replace with:

```js
  'auth.js',
  'store.js',
  'thumb-cache.js',
```

- [ ] **Step 3: Verify syntax**

Run: `node --check sw.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW cache v3->v4 and precache thumb-cache.js"
```

---

## Task 6: Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full Node suite**

Run: `node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js && node tests/thumb-cache.test.js`
Expected: every file prints `0 failed`.

- [ ] **Step 2: Syntax-check all changed source**

Run: `node --check popup.js && node --check thumb-cache.js && node --check sw.js && node --check lib/drive.js`
Expected: no output (exit 0).

- [ ] **Step 3: Manual browser checklist** (requires a configured OAuth Client ID; serve with `python3 -m http.server 8000`)

  - [ ] First load of an uncached folder fetches icons from Drive (DevTools → Network shows the requests).
  - [ ] Revisit / re-open the same folder → icons appear instantly, with **no** new thumbnail requests in Network.
  - [ ] Reload with Network set to **Offline** → cached icons still render.
  - [ ] DevTools → Application → IndexedDB → `iconlib-thumbs` → `thumbs` store is populated, keyed by file id.
  - [ ] Edit an icon's content in Drive, click **Refresh** in the app → that icon updates (its new `modifiedTime` supersedes the cached bytes).
  - [ ] PNG icons (not just SVGs) render and persist offline.
  - [ ] Icons display at 40px; labels are dark, bold, and clearly legible.

---

## Self-review notes

- **Spec coverage:** `modifiedTime` in index (Task 1); `thumb-cache.js` with `getThumb`/`putThumb` + DI (Task 2); cache-first SVG+PNG in `makeIconTile`, inline-size removal (Task 3); 40px icons + dark bold labels + 96px grid min (Task 4); SW v3→v4 + precache `thumb-cache.js` (Task 5); tests + manual checklist incl. freshness and offline (Task 6). All spec sections map to a task.
- **Type consistency:** `makeThumbCache({get, put})`, `getThumb(fileId, modifiedTime)` returning a `{modifiedTime, type, data}` record or `null`, and `putThumb(fileId, modifiedTime, type, data)` are used identically in `thumb-cache.js`, its test, and `makeIconTile`. `file.modifiedTime` is the field added in Task 1.
- **No prefetch / eviction / git / CDN** — matches the spec's out-of-scope list.
