# Design: Night Mode + UI Polish

**Date:** 2026-06-03
**Status:** Approved for planning

## Goal

Four related UI enhancements: a manual night-mode toggle, a logo favicon, a
bigger heading, and bigger search text.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Night-mode trigger | Manual toggle button in the header; choice persisted per-browser via `store.js`. No OS auto-detect. |
| Dark-mode implementation | CSS custom properties (theme tokens) in `:root`, overridden under `[data-theme="dark"]` on `<html>`. |
| Favicon | New `favicon.svg` reproducing the header logo mark; `<link rel="icon">` in head. |
| Heading size | `.app-title` 13px → 18px; logo box 24→28px, inner SVG 14→16px. |
| Search text | `.search-input` 12px → 14px; height 32px → 38px. |

## Part 1 — Night mode

### Theme tokens (`popup.css`)

Today ~19 colors are hardcoded across `popup.css`. Introduce a semantic token
set in `:root` (light) and override it under `[data-theme="dark"]`, then replace
the hardcoded grayscale colors with `var(--token)`. Accent indigo, success
green, danger red, and the semi-transparent tile overlays stay (accent lightened
in dark). The change is mechanical (color → token).

Token set and values (the implementation plan refined these names — the
authoritative, shipped set is: `--bg`, `--surface`, `--subtle`, `--border`,
`--border-strong`, `--text`, `--text-2`, `--text-3`, `--text-4`, `--text-5`,
`--accent`, `--accent-soft-bg`, `--accent-soft-border`, `--logo-bg`,
`--folder-bg` — see `popup.css`). The illustrative block below uses the earlier
draft names:

```css
:root {
  --bg: #ffffff;
  --surface: #f9fafb;
  --surface-hover: #f3f4f6;
  --border: #e5e7eb;
  --border-subtle: #f3f4f6;
  --text: #111827;
  --text-secondary: #374151;
  --text-muted: #9ca3af;
  --text-faint: #c4c9d4;
  --accent: #6366f1;
  --accent-soft-bg: #f0f0ff;
  --accent-soft-border: #c7d2fe;
  --logo-bg: #111827;
}
[data-theme="dark"] {
  --bg: #0f1115;
  --surface: #1a1d23;
  --surface-hover: #23272f;
  --border: #2a2f3a;
  --border-subtle: #20242c;
  --text: #e5e7eb;
  --text-secondary: #cbd2dc;
  --text-muted: #9aa3b2;
  --text-faint: #6b7280;
  --accent: #818cf8;
  --accent-soft-bg: #1e2233;
  --accent-soft-border: #3b3f57;
  --logo-bg: #1f2430;
}
```

Color → token mapping for the replacements:

| Hardcoded | Token |
|-----------|-------|
| `#fff` / `#ffffff` (page/input bg) | `--bg` |
| `#f9fafb` | `--surface` |
| `#f3f4f6` (hover bg) / `#f0f0ff` | `--surface-hover` / `--accent-soft-bg` |
| `#f3f4f6` (borders) | `--border-subtle` |
| `#e5e7eb` | `--border` |
| `#111827` (text) | `--text` |
| `#374151` | `--text-secondary` |
| `#9ca3af` / `#6b7280` | `--text-muted` |
| `#c4c9d4` | `--text-faint` |
| `#6366f1` | `--accent` |
| `#c7d2fe` | `--accent-soft-border` |
| `#111827` (logo box bg) | `--logo-bg` |

`#1f2937` (the `.tile-name` label) maps to `--text` so labels stay legible on
the dark tile. Keep `#dc2626`, `#10b981`, the folder yellows (`#ca8a04`,
`#fef9c3`), and the `rgba(...)` tile overlays as-is — they read fine on both
themes.

### Toggle (`index.html`, `popup.js`)

- A `#btn-theme` button in `.header-right`, left of `#btn-settings`, with a
  sun/moon SVG. Same `.icon-btn` styling.
- `popup.js`: bind once at module load (like `btn-settings`). On click: read
  current theme from `document.documentElement.dataset.theme`, flip it, set
  `data-theme` on `<html>`, persist via `store.set('theme', next)`, update the
  button icon/label.
- An `initThemeToggle()` sets the button's icon to match the current theme on
  load.

### No flash of unstyled theme (FOUC)

`popup.js` is a deferred module, so a saved dark theme would flash light first.
Add a tiny **inline** script in `<head>` (before the stylesheet) that applies the
saved theme before paint:

```html
<script>
  try {
    if (JSON.parse(localStorage.getItem('theme')) === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
</script>
```

`JSON.parse` matches `store.js`'s serialization (it stores `"dark"` with quotes).
The theme lives on `<html>` and persists, so it applies to every screen (setup,
sign-in, main); the toggle button only appears in the main header, which is fine
— set once, sticks everywhere. First run defaults to light (manual-only).

## Part 2 — Favicon

Create `favicon.svg` reproducing the header logo mark: a rounded-square
`--logo-bg`-colored tile containing the four white rounded squares. Wire in
`<head>`:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```

Keep the existing `apple-touch-icon`. Add `favicon.svg` to the service-worker
`SHELL` precache. (The favicon uses a fixed dark tile, independent of theme.)

## Part 3 — Sizing (`popup.css`, `index.html`)

- `.app-title`: `font-size: 13px` → `18px`.
- `.logo`: `24px × 24px` → `28px × 28px`; the inline header logo SVG
  `width/height="14"` → `16`.
- `.search-input`: `font-size: 12px` → `14px`; `height: 32px` → `38px`.

## Service worker

Bump cache `iconlib-shell-v4` → `iconlib-shell-v5` (CSS/JS/HTML change) and add
`favicon.svg` to the `SHELL` list.

## Testing

- **Automated (Node):** the changes are CSS/DOM/asset only; no new pure logic
  worth a Node unit test. Existing suite (`store`/`drive`/`utils`/`thumb-cache`)
  must still pass; all changed source must pass `node --check`.
- **Manual checklist:**
  1. Header shows a theme toggle; clicking it flips light ↔ dark across all
     surfaces (header, views, tiles, search, footer).
  2. Choice persists across reload with no light flash before dark paints
     (FOUC script works); dark also applies on the sign-in/setup screens.
  3. Browser tab shows the Icon Library logo favicon.
  4. Heading reads larger (18px) with a slightly larger logo; search text is
     14px in a taller field.
  5. Existing flows (browse, search, copy, settings) still work in both themes.

## Out of scope (YAGNI)

- No OS `prefers-color-scheme` auto-detection (manual toggle only).
- No per-folder or scheduled theming.
- No multi-PNG-size favicon set (single SVG + existing apple-touch-icon).
