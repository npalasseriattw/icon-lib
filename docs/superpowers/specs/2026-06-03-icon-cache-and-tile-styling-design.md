# Design: Local Thumbnail Cache + Tile Styling

**Date:** 2026-06-03
**Status:** Approved for planning
**Branch:** builds on `configurable-page-size` (full-width grid + page-size selector)

## Goal

Make icon loading fast on repeat views without committing icons to git, and
improve tile legibility. Two independent parts:

1. **Local thumbnail cache** — persist fetched icon bytes in the browser so
   repeat/offline views are instant. Google Drive stays the single source of
   truth; nothing is added to git.
2. **Tile styling** — larger icons and readable labels.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Data source | Google Drive remains source of truth (no git-committed icons, no CDN sync, no backend) |
| Speed strategy | Local persistent cache of fetched bytes (Option A) |
| Cache freshness | Key by `fileId`, validate against `modifiedTime` — auto-refreshes when an icon changes in Drive |
| Background prefetch | None — cache on view (as icons scroll in), to avoid hammering Drive on large libraries |
| Eviction | None now (YAGNI); SVGs are tiny, IndexedDB quota is ample. Revisit LRU only if needed |
| Icon size | 40×40px (was 28×28) |
| Label | 10px, `#1f2937`, font-weight 600 (was 8px `#9ca3af`) |

## Part 1 — Local thumbnail cache

### `thumb-cache.js` (new)

A dedicated IndexedDB object store, separate from the icon index in `store.js`.

- **Object store:** `thumbs`, key = `fileId`.
- **Record:** `{ modifiedTime, type, data }` where `data` is SVG text (string)
  for `image/svg+xml`, or a PNG `Blob` for `image/png`.
- **Connection:** cache the `openDb()` promise at module scope (same pattern as
  `store.js`) so per-tile lookups don't reopen the database.
- **API:**
  - `getThumb(fileId, modifiedTime)` → returns the cached record's `data` only
    if the stored `modifiedTime` matches the passed one; otherwise `null`
    (treated as a miss).
  - `putThumb(fileId, modifiedTime, type, data)` → stores/overwrites the record.
- Errors (quota, abort, unavailable) are swallowed to `null`/no-op — the cache
  is an optimization, never a hard dependency. A miss always falls back to a
  live Drive fetch.

### `lib/drive.js` change

Add `modifiedTime` to the files query so each index entry carries it:

- `fields` becomes `nextPageToken,files(id,name,mimeType,modifiedTime)`.
- `buildIndex` includes `modifiedTime` on each file record it produces.

This is the freshness signal. Because the index is what supplies
`modifiedTime`, a **Refresh** (which rebuilds the index) is what surfaces a
changed icon: the new `modifiedTime` no longer matches the cached record, so
`getThumb` misses and the fresh bytes are fetched and re-stored. Superseded
records are harmless orphans (small; optional cleanup later).

### `popup.js` `makeIconTile` change

The lazy-load (IntersectionObserver) path becomes **cache-first** for both
SVG and PNG:

1. On intersect, call `getThumb(file.id, file.modifiedTime)`.
2. **Hit:** render immediately from cached bytes — no network. (SVG → blob URL
   from text; PNG → object URL from blob.)
3. **Miss:** fetch from Drive via the existing path (`getFileContent` for SVG;
   for PNG, fetch the thumbnail URL as a blob instead of setting `img.src`
   directly), then `putThumb(...)` and render.

PNG tiles thus move from a direct `img.src = drive.google.com/thumbnail?...` to
the same fetch-and-cache path, so PNGs are cached and work offline too.

Object URLs are revoked on `img.onload`/`onerror` (existing behavior) to avoid
leaks. Cache misses still pass through the existing 6-at-a-time `thumbSem`
concurrency cap.

### Service worker

Bump cache name `iconlib-shell-v3` → `iconlib-shell-v4` (the shell JS changes),
and add `thumb-cache.js` to the `SHELL` precache list. Google hosts remain
network-only; the thumbnail cache lives in IndexedDB managed by app code, not
the service worker.

### Performance notes

- A cache hit is a sub-millisecond–to–few-ms async IndexedDB read replacing a
  150–350 ms authenticated network round-trip — strictly faster, never slower.
- IndexedDB I/O is async and does not block scroll/render.
- The cache adds no DOM cost; tile count is governed by the page-size selector.
- First scroll through a never-cached library is network-bound (same as today);
  caching only removes work on repeat.

## Part 2 — Tile styling (`popup.css`, `popup.js`)

- **Icon size:** `.icon-tile img` → `40px × 40px` (from 28px). Remove the
  duplicate inline `img.width = 28; img.height = 28;` in `popup.js`
  `makeIconTile` so size is controlled in CSS only.
- **Label (`.tile-name`):** `font-size: 10px; color: #1f2937; font-weight: 600;`
  (from `8px`, `#9ca3af`, default weight).
- **Sub-label (`.tile-path`):** `font-size: 9px; color: #6b7280;` (from `7px`,
  `#c4c9d4`).
- **Grid column min:** `.icon-grid` / `.skeleton-grid`
  `minmax(88px, 1fr)` → `minmax(96px, 1fr)` so the larger icon + bolder label
  sit comfortably.

## Testing

- **Automated (Node):** extend the suite to cover the new `lib/drive.js`
  `modifiedTime` field in `buildIndex` (the existing `drive.test.js` mock and
  assertions get a `modifiedTime` added). `thumb-cache.js` is browser-only
  (IndexedDB) and is verified manually, like `store.js`/`auth.js`.
- **Manual checklist:**
  1. First load of an uncached folder fetches icons from Drive (as before).
  2. Re-open / revisit a folder → icons appear instantly (no network in
     DevTools → Network for those thumbnails).
  3. Offline reload → cached icons still render.
  4. Edit an icon in Drive, hit **Refresh** → the changed icon updates (cache
     superseded via `modifiedTime`).
  5. DevTools → Application → IndexedDB shows a `thumbs` store populated by id.
  6. Icons render at 40px; labels are dark, bold, legible.
  7. PNG icons cache and render offline (not just SVGs).

## Out of scope (YAGNI)

- No background prefetch / cache warming.
- No cache eviction / size cap (no LRU yet).
- No CDN sync, no git-committed icons, no backend.
- No orphan-record cleanup on Refresh (orphans are small and harmless).
