# Night Mode + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual night-mode toggle (CSS theme tokens, persisted), a logo favicon, a bigger heading, and bigger search text.

**Architecture:** Convert `popup.css`'s hardcoded colors to semantic CSS custom properties defined in `:root` (light) and overridden under `[data-theme="dark"]` on `<html>`. A header toggle flips `data-theme` and persists the choice via `store.js`; an inline head script applies the saved theme before paint (no flash). Sizing and favicon are static asset/markup tweaks.

**Tech Stack:** Plain ES modules, no build step. CSS custom properties. IndexedDB/localStorage via `store.js`. Zero-dependency Node test scripts.

---

## Spec reference

`docs/superpowers/specs/2026-06-03-night-mode-and-ui-polish-design.md`. Branch: `night-mode-and-ui`.

## File structure

| File | Responsibility |
|------|----------------|
| `popup.css` (rewrite) | Theme tokens (`:root` + `[data-theme="dark"]`); all grayscale colors → `var(--token)`; sizing bumps; theme-icon show/hide. |
| `favicon.svg` (new) | Logo mark (dark rounded tile + four white squares). |
| `index.html` (modify) | FOUC theme script, favicon link, theme toggle button, larger header logo SVG. |
| `popup.js` (modify) | Bind the theme toggle: flip `data-theme`, persist `theme` via `store.js`. |
| `sw.js` (modify) | Cache bump v4→v5; precache `favicon.svg`. |

## How to test

Changes are CSS/DOM/asset only — no new pure logic, so no new Node test. The existing suite must still pass and changed JS must parse:

```bash
node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js && node tests/thumb-cache.test.js
node --check popup.js && node --check sw.js
```

Theme/favicon/sizing are verified through the manual checklist in Task 6 (browser-only).

---

## Task 1: Theme tokens + sizing (rewrite `popup.css`)

**Files:**
- Modify (full rewrite): `popup.css`

This replaces every grayscale color with a semantic token and applies the Moderate sizing bumps (`.app-title` 18px, `.logo` 28px, `.search-input` 14px/38px). Accent indigo, success green, danger red, the folder yellow, and the `rgba(...)` tile overlays are tokenized or kept as appropriate. The logo-box background uses `--logo-bg` (stays a dark tile in both themes); `.btn-primary` inverts via `--text`/`--bg`.

- [ ] **Step 1: Replace the entire contents of `popup.css` with:**

```css
:root {
  --bg: #ffffff;
  --surface: #f9fafb;
  --subtle: #f3f4f6;
  --border: #e5e7eb;
  --border-strong: #d1d5db;
  --text: #111827;
  --text-2: #374151;
  --text-3: #6b7280;
  --text-4: #9ca3af;
  --text-5: #c4c9d4;
  --accent: #6366f1;
  --accent-soft-bg: #f0f0ff;
  --accent-soft-border: #c7d2fe;
  --logo-bg: #111827;
  --folder-bg: #fef9c3;
}
[data-theme="dark"] {
  --bg: #0f1115;
  --surface: #1a1d23;
  --subtle: #20242c;
  --border: #2a2f3a;
  --border-strong: #3a4150;
  --text: #e5e7eb;
  --text-2: #cbd2dc;
  --text-3: #aab2bf;
  --text-4: #8b93a3;
  --text-5: #6b7280;
  --accent: #818cf8;
  --accent-soft-bg: #1e2233;
  --accent-soft-border: #3b3f57;
  --logo-bg: #1f2430;
  --folder-bg: rgba(202,138,4,0.18);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 100%;
  max-width: 1600px;
  min-height: 100vh;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
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
  border-bottom: 1px solid var(--subtle);
}

.header-left { display: flex; align-items: center; gap: 8px; }

.logo {
  width: 28px; height: 28px;
  background: var(--logo-bg); border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.logo-lg {
  width: 44px; height: 44px;
  background: var(--logo-bg); border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
}

.app-title { font-size: 18px; font-weight: 600; color: var(--text); }

.header-right { display: flex; align-items: center; gap: 8px; }

.sync-badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; color: var(--text-4);
}

.sync-dot {
  width: 6px; height: 6px;
  border-radius: 50%; background: #10b981;
}

.icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--text-4); padding: 2px;
  display: flex; align-items: center;
  border-radius: 4px;
  transition: color 0.1s, background 0.1s;
}
.icon-btn:hover { color: var(--text-2); background: var(--subtle); }

/* Theme toggle: show moon in light, sun in dark */
.icon-sun { display: none; }
[data-theme="dark"] .icon-sun { display: inline-flex; }
[data-theme="dark"] .icon-moon { display: none; }

/* ── Centered panels (auth, configure, error) ── */
.center-panel {
  display: flex; flex-direction: column;
  align-items: center; text-align: center;
  padding: 32px 24px;
  gap: 10px;
}

.center-panel h2 { font-size: 15px; font-weight: 600; color: var(--text); }
.muted { font-size: 12px; color: var(--text-3); }
.error-text { font-size: 12px; color: #dc2626; line-height: 1.5; }

/* ── Configure panel ── */
.configure-panel {
  display: flex; flex-direction: column;
  padding: 16px 14px;
  gap: 8px;
}

.configure-label { font-size: 12px; color: var(--text-2); font-weight: 500; }

.text-input {
  width: 100%; height: 36px;
  border: 1px solid var(--border); border-radius: 7px;
  padding: 0 10px; font-size: 12px; color: var(--text);
  background: var(--surface); outline: none;
}
.text-input:focus { border-color: var(--accent); background: var(--bg); }

.input-error { font-size: 11px; color: #dc2626; }

/* ── Buttons ── */
.btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--text); color: var(--bg);
  border: none; border-radius: 7px;
  padding: 9px 16px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.1s;
}
.btn-primary:hover { background: var(--text-2); }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--subtle); color: var(--text-2);
  border: none; border-radius: 7px;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.1s;
}
.btn-secondary:hover { background: var(--border); }

/* ── Search ── */
.search-wrap { padding: 10px 12px; border-bottom: 1px solid var(--subtle); }

.search-inner { position: relative; display: flex; align-items: center; }

.search-icon { position: absolute; left: 9px; color: var(--text-4); pointer-events: none; }

.search-input {
  width: 100%; height: 38px;
  border: 1px solid var(--border); border-radius: 6px;
  padding: 0 28px 0 30px; font-size: 14px; color: var(--text-2);
  background: var(--surface); outline: none;
}
.search-input:focus { border-color: var(--accent); background: var(--bg); }
.search-input::placeholder { color: var(--text-5); }
.search-input:disabled { opacity: 0.5; cursor: not-allowed; }

.clear-btn {
  position: absolute; right: 8px;
  background: none; border: none; cursor: pointer;
  font-size: 10px; color: var(--text-4); padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.1s;
}
.clear-btn:hover { color: var(--text-2); }

/* ── Loading skeleton ── */
.loading-status {
  padding: 8px 14px 4px;
  font-size: 11px; color: var(--text-4);
}

.skeleton-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px; padding: 12px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.skeleton-tile {
  aspect-ratio: 1;
  background: var(--subtle);
  border-radius: 7px;
  animation: pulse 1.5s ease-in-out infinite;
}

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex; align-items: center; flex-wrap: nowrap;
  gap: 3px; padding: 7px 12px;
  border-bottom: 1px solid var(--subtle);
  font-size: 11px; overflow-x: auto;
  white-space: nowrap;
}

.bc-item { color: var(--text-3); cursor: pointer; }
.bc-item:hover { color: var(--text); text-decoration: underline; }
.bc-item.current { color: var(--text); font-weight: 600; cursor: default; }
.bc-item.current:hover { text-decoration: none; }
.bc-sep { color: var(--border-strong); }
.bc-clear { margin-left: auto; color: var(--text-4); cursor: pointer; font-size: 10px; }
.bc-clear:hover { color: var(--text-2); }

/* ── Folder list ── */
.folder-list { display: flex; flex-direction: column; gap: 1px; }

.folder-row {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: 7px;
  cursor: pointer; transition: background 0.1s;
  margin: 0 2px;
}
.folder-row:hover { background: var(--surface); }

.folder-icon {
  width: 30px; height: 30px;
  background: var(--folder-bg); border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.folder-name { font-size: 12px; font-weight: 500; color: var(--text-2); }
.folder-count { font-size: 10px; color: var(--text-4); margin-left: auto; }
.folder-chevron { color: var(--border-strong); flex-shrink: 0; }

/* ── Icon grid ── */
.grid-wrap { padding: 12px; }

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.icon-tile {
  position: relative; aspect-ratio: 1;
  border-radius: 7px; background: var(--surface);
  border: 1px solid var(--subtle);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden;
  transition: background 0.1s, border-color 0.1s;
}
.icon-tile:hover { background: var(--accent-soft-bg); border-color: var(--accent-soft-border); }

.icon-tile img {
  width: 40px; height: 40px;
  object-fit: contain; pointer-events: none;
}

.tile-name {
  font-size: 10px; color: var(--text); font-weight: 600; text-align: center;
  padding: 0 3px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; position: absolute;
  bottom: 3px; left: 0; right: 0;
}

.tile-path {
  font-size: 9px; color: var(--text-3); text-align: center;
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
  padding: 8px 12px; border-top: 1px solid var(--subtle);
}

.footer-count { font-size: 11px; color: var(--text-4); }

.page-size { font-size: 11px; color: var(--text-4); display: flex; align-items: center; gap: 5px; }
.page-size select {
  font-size: 11px; color: var(--text-3); background: var(--bg);
  border: 1px solid var(--border); border-radius: 5px; padding: 2px 4px; cursor: pointer;
}

.footer-link {
  font-size: 11px; font-weight: 500; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 0;
}
.footer-link:hover { text-decoration: underline; }

.load-more-btn {
  display: block; width: calc(100% - 16px); margin: 8px 8px 4px;
  padding: 8px; font-size: 11px; font-weight: 500; color: var(--text-3);
  background: var(--surface); border: 1px solid var(--border); border-radius: 7px;
  cursor: pointer; transition: background 0.1s, color 0.1s;
}
.load-more-btn:hover { background: var(--subtle); color: var(--text-2); }
```

- [ ] **Step 2: Verify no stray hardcoded grayscale remains**

Run: `grep -nE "#(fff|ffffff|f9fafb|f3f4f6|e5e7eb|d1d5db|111827|1f2937|374151|6b7280|9ca3af|c4c9d4|6366f1|f0f0ff|c7d2fe|fef9c3)\b" popup.css`
Expected: matches ONLY inside the `:root` and `[data-theme="dark"]` token blocks at the top (the definitions). No matches in the rule bodies below. `#dc2626`, `#10b981`, and the `rgba(...)` overlays may still appear in rule bodies — that is intended.

- [ ] **Step 3: Commit**

```bash
git add popup.css
git commit -m "feat: theme tokens for night mode + larger heading/search sizing"
```

---

## Task 2: Favicon

**Files:**
- Create: `favicon.svg`

- [ ] **Step 1: Create `favicon.svg` with:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#111827"/>
  <g fill="#ffffff">
    <rect x="8" y="8" width="7" height="7" rx="1.5"/>
    <rect x="17" y="8" width="7" height="7" rx="1.5"/>
    <rect x="8" y="17" width="7" height="7" rx="1.5"/>
    <rect x="17" y="17" width="7" height="7" rx="1.5"/>
  </g>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add favicon.svg
git commit -m "feat: add Icon Library logo favicon"
```

---

## Task 3: index.html — FOUC script, favicon link, theme button, larger logo

**Files:**
- Modify: `index.html` (`<head>` and the header)

- [ ] **Step 1: Add the favicon link and FOUC theme script to `<head>`**

Find:

```html
  <meta name="theme-color" content="#111827">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/icon-128.png">
  <link rel="stylesheet" href="popup.css">
```

Replace with:

```html
  <meta name="theme-color" content="#111827">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="apple-touch-icon" href="icons/icon-128.png">
  <script>
    // Apply the saved theme before first paint to avoid a flash of light.
    // store.js serializes with JSON, so the stored value is "dark" (quoted).
    try {
      if (JSON.parse(localStorage.getItem('theme')) === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="popup.css">
```

- [ ] **Step 2: Enlarge the header logo SVG**

Find (the header logo mark):

```html
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
```

Replace with:

```html
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
```

- [ ] **Step 3: Add the theme toggle button in the header**

Find:

```html
    <div class="header-right">
      <span id="sync-badge" class="sync-badge hidden">
        <span class="sync-dot"></span>
        <span id="sync-label"></span>
      </span>
      <button id="btn-settings" class="icon-btn" title="Change Drive folder" aria-label="Change Drive folder">
```

Replace with:

```html
    <div class="header-right">
      <span id="sync-badge" class="sync-badge hidden">
        <span class="sync-dot"></span>
        <span id="sync-label"></span>
      </span>
      <button id="btn-theme" class="icon-btn" title="Toggle night mode" aria-label="Toggle night mode">
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      </button>
      <button id="btn-settings" class="icon-btn" title="Change Drive folder" aria-label="Change Drive folder">
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: favicon link, no-flash theme script, theme toggle button, larger logo"
```

---

## Task 4: popup.js — bind the theme toggle

**Files:**
- Modify: `popup.js` (add a module-level listener next to the other header-button listeners)

- [ ] **Step 1: Add the theme toggle listener**

In `popup.js`, find the existing change-client listener:

```js
document.getElementById('btn-change-client').addEventListener('click', async () => {
  await clearClientId();
  showClientIdSetupView();
});
```

Immediately after it, add:

```js
// Night-mode toggle. The saved theme is applied pre-paint by the inline script
// in index.html; here we just flip it and persist the choice.
document.getElementById('btn-theme').addEventListener('click', async () => {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  if (next === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  await store.set('theme', next);
});
```

- [ ] **Step 2: Verify syntax and that nothing regressed**

Run: `node --check popup.js`
Expected: no output (exit 0).

Run: `node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js && node tests/thumb-cache.test.js`
Expected: all report `0 failed`.

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: wire night-mode toggle (persist theme via store.js)"
```

---

## Task 5: Service worker — cache bump + precache favicon

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump the cache version**

In `sw.js`, find:

```js
const CACHE = 'iconlib-shell-v4';
```

Replace with:

```js
const CACHE = 'iconlib-shell-v5';
```

- [ ] **Step 2: Precache the favicon**

In `sw.js`, find:

```js
  'manifest.webmanifest',
```

Replace with:

```js
  'manifest.webmanifest',
  'favicon.svg',
```

- [ ] **Step 3: Verify syntax**

Run: `node --check sw.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW cache v4->v5 and precache favicon.svg"
```

---

## Task 6: Verification

**Files:** none (verification only)

- [ ] **Step 1: Automated checks**

Run: `node tests/store.test.js && node tests/drive.test.js && node tests/utils.test.js && node tests/thumb-cache.test.js`
Expected: every file prints `0 failed`.

Run: `node --check popup.js && node --check sw.js`
Expected: no output.

- [ ] **Step 2: Manual browser checklist** (serve with `python3 -m http.server 8000`, configured Client ID)

  - [ ] Header shows a moon (theme) button left of Settings; clicking it flips the whole UI light ↔ dark (header, search, breadcrumb, folder rows, tiles, footer, buttons) and the icon switches to a sun.
  - [ ] Reload after choosing dark → it stays dark with **no** white flash before paint (FOUC script). The sign-in/setup screens are also dark.
  - [ ] Browser tab shows the Icon Library logo favicon.
  - [ ] Heading reads at 18px with a slightly larger logo; search field text is 14px in a taller (38px) box.
  - [ ] Tile labels remain legible in dark mode (light text on dark tiles); accent/hover/copy overlays look right in both themes.
  - [ ] Browse, search, copy, settings, and page-size selector all still work in both themes.

---

## Self-review notes

- **Spec coverage:** theme tokens + dark override (Task 1); toggle button + persistence + FOUC (Tasks 3-4); favicon (Tasks 2-3); heading 18px + logo 28/16px (Tasks 1, 3); search 14px/38px (Task 1); SW v4→v5 + favicon precache (Task 5); verification (Task 6). All spec sections map to a task.
- **Type/name consistency:** `data-theme="dark"` attribute, `store` key `'theme'` with values `'dark'`/`'light'`, button id `btn-theme`, and icon classes `icon-moon`/`icon-sun` are used identically across `index.html`, `popup.css`, `popup.js`, and the FOUC script. The FOUC script's `JSON.parse` matches `store.js`'s JSON serialization.
- **No placeholders;** full `popup.css` and all edits are complete.
