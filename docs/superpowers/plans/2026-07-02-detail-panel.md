# Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace click-to-copy tile behaviour with a persistent right-side detail panel that shows the full filename, folder path, a large icon preview, and granular copy actions.

**Architecture:** Wrap the existing `#content` grid and a new `#detail-panel` in a `.main-split` flex row inside `view-main`. Clicking a tile selects it (highlighted border) and calls `showDetailPanel(file)` to populate the panel. Copy actions move from the tile hover overlay to the panel buttons. `handleCopy` gains a `mode` param (`'both' | 'svg' | 'png'`) and uses the clicked button for feedback instead of the tile overlay.

**Tech Stack:** Vanilla JS, HTML, CSS — no new dependencies.

---

### Task 1: HTML — wrap grid in `.main-split`, add `#detail-panel`

**Files:**
- Modify: `index.html` (view-main section, lines 160–189)

- [ ] **Step 1: Replace the `#content` div with a `.main-split` wrapper**

In `index.html`, find this block inside `#view-main`:
```html
    <div id="breadcrumb" class="breadcrumb"></div>

    <div id="content" class="grid-wrap"></div>

    <footer class="popup-footer">
```

Replace with:
```html
    <div id="breadcrumb" class="breadcrumb"></div>

    <div class="main-split">
      <div id="content" class="grid-wrap"></div>
      <div id="detail-panel" class="detail-panel">
        <div class="detail-empty"><p>Click an icon<br>to see details</p></div>
      </div>
    </div>

    <footer class="popup-footer">
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: wrap grid in main-split, add detail-panel placeholder"
```

---

### Task 2: CSS — split layout + detail panel styles

**Files:**
- Modify: `popup.css`

- [ ] **Step 1: Add flex layout for `#view-main` and `.main-split`**

After the `.breadcrumb` block (around line 220), add:

```css
/* ── Main split layout ── */
#view-main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-split {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.main-split .grid-wrap {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}
```

- [ ] **Step 2: Add `.detail-panel` and its child styles**

After the block you just added, append:

```css
.detail-panel {
  width: 220px;
  flex-shrink: 0;
  border-left: 1px solid var(--subtle);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 14px 12px;
  gap: 12px;
  background: var(--bg);
}

.detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 11px;
  color: var(--text-4);
  line-height: 1.6;
}

.detail-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  flex-shrink: 0;
}

.detail-preview img {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-filename {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  word-break: break-all;
  line-height: 1.4;
}

.detail-path {
  font-size: 10px;
  color: var(--text-4);
  line-height: 1.4;
}

.detail-type-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-soft-bg);
  color: var(--accent);
  align-self: flex-start;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}

.btn-copy-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.1s;
}
.btn-copy-panel:disabled { opacity: 0.6; cursor: default; }

.btn-copy-panel-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  transition: background 0.1s;
}
.btn-copy-panel-secondary:hover { background: var(--subtle); }
.btn-copy-panel-secondary:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 3: Add selected tile highlight; remove copy-overlay rules**

Find and **delete** these CSS rules (lines ~283–294):
```css
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
```

Then add the selected state after `.icon-tile:hover`:
```css
.icon-tile.selected {
  background: var(--accent-soft-bg);
  border-color: var(--accent);
  border-width: 2px;
}
```

- [ ] **Step 4: Commit**

```bash
git add popup.css
git commit -m "feat: split layout and detail panel CSS"
```

---

### Task 3: JS — update `makeIconTile` (remove overlay, change click to select)

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add `selectedTile` module-level variable**

After the `state` object declaration (around line 14), add:

```js
let selectedTile = null;
```

- [ ] **Step 2: Remove copy-overlay from `makeIconTile`**

In `makeIconTile` (around line 556), find and **delete** these lines:

```js
  const overlay = document.createElement('div');
  overlay.className = 'copy-overlay';
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="13" height="13">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    Copy
  `;
```

Also delete the `tile.appendChild(overlay);` line that follows the `tile.appendChild(img);` line.

- [ ] **Step 3: Change the tile click handler**

Find:
```js
  tile.addEventListener('click', () => handleCopy(file.id, file.mimeType, tile));
```

Replace with:
```js
  tile.addEventListener('click', () => selectTile(file, tile));
```

- [ ] **Step 4: Add `selectTile` function**

Add this function just before `makeIconTile`:

```js
function selectTile(file, tile) {
  if (selectedTile) selectedTile.classList.remove('selected');
  selectedTile = tile;
  tile.classList.add('selected');
  showDetailPanel(file);
}
```

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: tile click selects instead of copying, remove copy overlay"
```

---

### Task 4: JS — add `showDetailPanel` and `showEmptyPanel`

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add `showEmptyPanel`**

Add this function immediately after `selectTile`:

```js
function showEmptyPanel() {
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = '<div class="detail-empty"><p>Click an icon<br>to see details</p></div>';
}
```

- [ ] **Step 2: Add `showDetailPanel`**

Add this function immediately after `showEmptyPanel`:

```js
function showDetailPanel(file) {
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = '';

  // Large preview
  const preview = document.createElement('div');
  preview.className = 'detail-preview';
  const img = document.createElement('img');
  img.alt = file.name;

  if (file.mimeType === 'image/svg+xml') {
    thumbCache.getThumb(file.id, file.modifiedTime).then(async (cached) => {
      let svgText;
      if (cached) {
        svgText = cached.data;
      } else {
        svgText = await getFileContent(state.token, file.id);
        await thumbCache.putThumb(file.id, file.modifiedTime, file.mimeType, svgText);
      }
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
    }).catch(() => { img.style.display = 'none'; });
  } else {
    img.onerror = () => { img.style.display = 'none'; };
    img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w128`;
  }

  preview.appendChild(img);
  panel.appendChild(preview);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'detail-meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'detail-filename';
  nameEl.textContent = file.name;
  meta.appendChild(nameEl);

  if (file.path) {
    const pathEl = document.createElement('div');
    pathEl.className = 'detail-path';
    pathEl.textContent = file.path;
    meta.appendChild(pathEl);
  }

  const badge = document.createElement('div');
  badge.className = 'detail-type-badge';
  badge.textContent = file.mimeType === 'image/svg+xml' ? 'SVG' : 'PNG';
  meta.appendChild(badge);

  panel.appendChild(meta);

  // Copy actions
  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  if (file.mimeType === 'image/svg+xml') {
    const btnBoth = document.createElement('button');
    btnBoth.className = 'btn-copy-panel';
    btnBoth.textContent = 'Copy SVG + PNG';
    btnBoth.addEventListener('click', () => handleCopy(file.id, file.mimeType, 'both', btnBoth));
    actions.appendChild(btnBoth);

    const btnSvg = document.createElement('button');
    btnSvg.className = 'btn-copy-panel-secondary';
    btnSvg.textContent = 'Copy SVG only';
    btnSvg.addEventListener('click', () => handleCopy(file.id, file.mimeType, 'svg', btnSvg));
    actions.appendChild(btnSvg);

    const btnPng = document.createElement('button');
    btnPng.className = 'btn-copy-panel-secondary';
    btnPng.textContent = 'Copy PNG only';
    btnPng.addEventListener('click', () => handleCopy(file.id, file.mimeType, 'png', btnPng));
    actions.appendChild(btnPng);
  } else {
    const btnPng = document.createElement('button');
    btnPng.className = 'btn-copy-panel';
    btnPng.textContent = 'Copy PNG';
    btnPng.addEventListener('click', () => handleCopy(file.id, file.mimeType, 'png', btnPng));
    actions.appendChild(btnPng);
  }

  panel.appendChild(actions);
}
```

- [ ] **Step 3: Reset panel on navigation**

In `renderRoot`, `renderFolder`, and `renderSearch`, add these two lines at the very top of each function body:

```js
  selectedTile = null;
  showEmptyPanel();
```

For `renderRoot` (around line 300), before `state.currentFolderId = null;`:
```js
function renderRoot() {
  selectedTile = null;
  showEmptyPanel();
  state.currentFolderId = null;
  // ... rest unchanged
```

For `renderFolder` (around line 331), before `state.currentFolderId = folderId;`:
```js
function renderFolder(folderId) {
  selectedTile = null;
  showEmptyPanel();
  state.currentFolderId = folderId;
  // ... rest unchanged
```

For `renderSearch` (around line 364), before `state.searchQuery = query;`:
```js
function renderSearch(query) {
  selectedTile = null;
  showEmptyPanel();
  state.searchQuery = query;
  // ... rest unchanged
```

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: showDetailPanel and showEmptyPanel, reset on navigation"
```

---

### Task 5: JS — refactor `handleCopy` for panel-based feedback

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace `handleCopy`, `showCopiedToast`, and `showTileError`**

Find and **replace the entire `handleCopy` function** (lines ~682–720):

```js
async function handleCopy(fileId, mimeType, mode, btnEl) {
  if (!navigator.onLine) {
    const orig = btnEl.textContent;
    btnEl.textContent = "Can't fetch — offline";
    btnEl.disabled = true;
    setTimeout(() => { btnEl.textContent = orig; btnEl.disabled = false; }, 2000);
    return;
  }

  const origText = btnEl.textContent;
  btnEl.textContent = '…';
  btnEl.disabled = true;

  try {
    if (mode === 'png') {
      let pngBlob;
      if (mimeType === 'image/png') {
        pngBlob = await getFileBlob(state.token, fileId);
      } else {
        const svgText = await getFileContent(state.token, fileId);
        pngBlob = await svgToPng(svgText);
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } else if (mode === 'svg') {
      const svgText = await getFileContent(state.token, fileId);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': svgBlob })]);
    } else {
      const svgText = await getFileContent(state.token, fileId);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const pngBlob = await svgToPng(svgText);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/svg+xml': svgBlob, 'image/png': pngBlob }),
      ]);
    }
    btnEl.textContent = 'Copied!';
    setTimeout(() => { btnEl.textContent = origText; btnEl.disabled = false; }, 1500);
  } catch (err) {
    btnEl.textContent = origText;
    btnEl.disabled = false;
    handleDriveError(err, state.index?.rootFolderId);
  }
}
```

Find and **delete `showCopiedToast`** (lines ~722–730):
```js
function showCopiedToast(tileEl) {
  const overlay = tileEl.querySelector('.copy-overlay');
  if (overlay.lastChild) overlay.lastChild.textContent = 'Copied!';
  tileEl._toastTimer = setTimeout(() => {
    tileEl._toastTimer = null;
    tileEl.classList.remove('copying');
    if (overlay.lastChild) overlay.lastChild.textContent = 'Copy';
  }, 1500);
}
```

Find and **delete `showTileError`** (lines ~732–741):
```js
function showTileError(tileEl, message) {
  const overlay = tileEl.querySelector('.copy-overlay');
  const prev = overlay.lastChild?.textContent;
  if (overlay.lastChild) overlay.lastChild.textContent = message;
  overlay.style.background = 'rgba(220,38,38,0.88)';
  setTimeout(() => {
    if (overlay.lastChild) overlay.lastChild.textContent = prev ?? 'Copy';
    overlay.style.background = '';
  }, 2000);
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.js
git commit -m "feat: handleCopy refactored for panel buttons, remove tile overlay helpers"
```

---

### Task 6: Bump SW cache and version stamp

**Files:**
- Modify: `sw.js`
- Modify: `index.html`

- [ ] **Step 1: Bump SW cache version**

In `sw.js` line 1, change:
```js
const CACHE = 'iconlib-shell-v6';
```
to:
```js
const CACHE = 'iconlib-shell-v7';
```

- [ ] **Step 2: Bump version stamp in header**

In `index.html`, change:
```html
      <span class="app-version">v6</span>
```
to:
```html
      <span class="app-version">v7</span>
```

- [ ] **Step 3: Commit and push**

```bash
git add sw.js index.html
git commit -m "chore: bump SW cache and version stamp to v7"
git push
```
