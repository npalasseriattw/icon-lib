# Detail Panel — Design Spec
Date: 2026-07-02

## Summary

Add a permanent right-side detail panel to the main view. Clicking an icon selects it and populates the panel with its full filename, folder path, a large preview, and copy actions. The copy action moves from the tile hover-overlay into the panel.

## Layout

The `view-main` content area becomes a two-column split:

- **Left — grid** (`flex: 1`, scrollable): the existing icon grid, narrower to accommodate the panel. Click on a tile selects it (highlights with a blue border); it no longer copies directly.
- **Right — detail panel** (fixed `220px` width, always visible): shows the selected icon's details. Shows an empty/prompt state when nothing is selected.

The header, search bar, breadcrumb, and footer are unchanged.

## Detail Panel Contents

**When an icon is selected:**
1. Large icon preview (72×72 in a padded, bordered container)
2. Full filename — `file.name` including extension, word-wrap allowed, no truncation
3. Folder path — `file.path` or breadcrumb to the parent folder, smaller muted text
4. File type badge — SVG (green) or PNG (blue)
5. Copy actions (stacked buttons):
   - **Copy SVG + PNG** (primary/filled) — existing clipboard write of both formats
   - **Copy SVG only** (secondary/outlined) — SVG blob only
   - **Copy PNG only** (secondary/outlined) — PNG blob only

**When nothing is selected:**
- Centered muted text: "Click an icon to see details"

## Behaviour Changes

| Before | After |
|---|---|
| Click tile → copy immediately | Click tile → select, populate panel |
| Hover overlay shows "Copy" | Hover overlay removed; tile hover uses background tint only |
| Filename truncated in tile | Full filename visible in panel |
| Single copy action (SVG+PNG) | Three granular copy actions in panel |

The tile `.tile-name` label at the bottom remains for at-a-glance identification.

## Components / Files Touched

- **`index.html`** — wrap `#content` and new `#detail-panel` in a `.main-split` flex container inside `view-main`
- **`popup.css`** — `.main-split`, `.detail-panel`, `.detail-preview`, `.detail-meta`, `.detail-actions`, `.btn-copy-secondary` styles; remove/restyle `.copy-overlay`
- **`popup.js`**:
  - `makeIconTile` — remove copy-on-click, add select-on-click that calls `showDetailPanel(file)`
  - `showDetailPanel(file)` — new function that renders the panel content and kicks off SVG lazy-load for the preview
  - `handleCopy(fileId, mimeType, mode)` — extend with a `mode` param (`'both' | 'svg' | 'png'`) to support the three copy buttons
  - `renderMain` — initialise panel to empty state

## Out of Scope

- Keyboard navigation between tiles
- Panel resize / collapse
- Multiple selection
