# Design: Convert Icon Library Extension → Installable PWA

**Date:** 2026-06-02
**Status:** Approved for planning

## Goal

Convert the existing Manifest V3 Chrome extension into an installable Progressive
Web App (PWA), served as a static site over HTTPS, that can be installed via
Chrome's "Install app" prompt. The extension is **retired** — a single PWA
codebase replaces it.

## Decisions

| Decision | Choice |
|----------|--------|
| Extension vs PWA | PWA only — retire the extension, one codebase |
| Hosting | GitHub Pages at `https://npalasseriattw.github.io/icon-lib/` |
| Auth | Browser-only Google Identity Services (GIS) token client, ~1-hour tokens, no backend |
| Build step | None — plain static HTML/CSS/JS |
| Framework | None |

## Architecture

Single static site deployed to GitHub Pages. ~80% of existing code is reused
unchanged. The Chrome-extension-specific surface (`chrome.*` APIs, the MV3
manifest, the background service worker) is the only part that changes.

### File changes

| File | Change |
|------|--------|
| `popup.html` → `index.html` | Rename. Add `<link rel="manifest">`, GIS `<script>` tag, service-worker registration |
| `popup.css` | Keep. Responsive tweaks: full-window layout instead of fixed popup width |
| `popup.js` | Keep. Route every `chrome.*` call through new `auth.js` / `store.js` |
| `lib/drive.js` | **Unchanged** |
| `lib/utils.js` | **Unchanged** |
| `background.js` | **Deleted** (extension-only) |
| `manifest.json` | **Replaced** by `manifest.webmanifest` |
| `auth.js` | **New** — GIS token client |
| `store.js` | **New** — storage shim (IndexedDB + localStorage) |
| `sw.js` | **New** — PWA service worker |

## Components

### `auth.js` — Google Identity Services

Wraps `google.accounts.oauth2.initTokenClient` with scope
`https://www.googleapis.com/auth/drive.readonly`.

- Exposes `getToken()` — returns a live cached token, or triggers a consent
  popup when none is valid.
- Exposes `signOut()` — clears the cached token.
- Token + expiry cached via `store.js`. On expiry, attempts a silent re-request,
  falling back to a visible consent popup.
- Replaces `chrome.identity.getAuthToken` and
  `chrome.identity.launchWebAuthFlow` (`popup.js:27-58`).
- No redirect URI needed — GIS uses a popup + `postMessage`. Only the
  **authorized JavaScript origin** `https://npalasseriattw.github.io` is
  registered in the OAuth client.

**OAuth Client ID handling (security):** the Client ID for a browser client is a
public identifier, not a secret — but it is kept **out of source control** and
stored per-browser instead. `auth.js` exposes `getClientId()` / `hasClientId()`
/ `setClientId()` / `clearClientId()`, persisting the value via `store.js`
(localStorage key `oauthClientId`). On first run, when no Client ID is set,
`popup.js` shows a setup view (`view-setup`) demanding it; the error view offers
a **Change OAuth client ID** recovery path. The real access-control boundary is
the OAuth client's **Authorized JavaScript origins** allowlist, not the secrecy
of the ID. The client *secret* Google issues for a "Web application" client is
never used by the browser token flow and must never be committed.

### `store.js` — storage shim

Exposes the same Promise-based get/set/remove shape `popup.js` already uses, so
call sites don't change beyond the namespace. **Storage is split by payload
size:**

- **`iconIndex` → IndexedDB.** Async (no main-thread block) and effectively
  unbounded quota. A 10k-icon index is ~1–2 MB; IndexedDB handles 10k–100k+
  icons comfortably. This is the critical choice for large libraries —
  `localStorage` would be both too small (~5 MB cap) and synchronous (blocking
  parse/stringify of a multi-MB string on every open/save, reintroducing the
  hang fixed in commit `5d19090`).
- **Small values → `localStorage`** (JSON-serialized): `guestToken`,
  `guestTokenExpiry`, `rootFolderId`. Trivially small; synchronous access is
  fine.

The existing accessors (`getCachedIndex`, etc.) are already Promise-based, so
the async IndexedDB backend slots in without changing the call sites' shape.

### PWA assets

- **`manifest.webmanifest`**: `name`, `short_name`, `start_url: "."`,
  `scope: "."`, `display: "standalone"`, theme/background colors. Reuses
  existing `icons/icon-{16,48,128}.png`; adds a 512px icon for install quality.
- **`sw.js`**: caches the app shell (HTML/CSS/JS + icons) for installability and
  instant loads. **Cache-first** for the shell; **network-only** for
  `googleapis.com` requests (Drive API and thumbnails always hit the network —
  the large index is never cached by the SW).

### chrome.* removal

- `chrome.tabs.create` → `window.open(url, '_blank')` (`popup.js:348`).
- `chrome.runtime.getManifest().oauth2.client_id` → `CONFIG.clientId` constant
  in `auth.js` (`popup.js:47`).
- Drop all `chrome.runtime.lastError` checks.

## Scale behavior (large icon libraries)

The conversion preserves all prior performance work:

- **Drive API pagination** — `lib/drive.js` loops `nextPageToken` at
  `pageSize 1000`. Unchanged.
- **Grid pagination + lazy thumbnails** — `files.slice(offset, offset +
  GRID_PAGE_SIZE)` and the `IntersectionObserver` lazy-load in `popup.js`.
  Unchanged.
- **Index caching** — moved to IndexedDB (see `store.js` above), which removes
  the only scalability risk the conversion would otherwise introduce.

Net: rendering and network behavior at 10k+ icons are identical to the
extension, with no main-thread blocking on the cached index.

## Hosting & config

- GitHub Pages served from the repo (`npalasseriattw/icon-lib`). Note the
  project subpath `/icon-lib/`; `start_url`, `scope`, and SW registration scope
  account for it.
- New Google Cloud OAuth client of type **Web application**, with authorized
  JavaScript origin set to `https://npalasseriattw.github.io`.
- README rewritten: drop extension-loading steps; add "open the URL / click
  Install", and the updated one-time OAuth (Web application) setup.

## Error handling

- **No valid token / consent denied** — surface the existing auth-error UI;
  `getToken()` rejects and the caller shows the sign-in state.
- **Token expired mid-session** — silent re-request; on failure, visible consent
  popup.
- **IndexedDB unavailable / quota error** — fall back to refetching the index
  from Drive (the index is a cache, not a source of truth).
- **Offline** — app shell loads from SW cache; Drive calls fail gracefully with
  the existing network-error messaging.

## Testing

- Existing `tests/` adjusted for the `store.js` shim (IndexedDB + localStorage).
- Manual checklist:
  1. Chrome shows the "Install app" prompt.
  2. Auth popup completes and returns a Drive token.
  3. Icons load and the folder tree renders.
  4. Copy-to-clipboard works (image + SVG source).
  5. Large library (~10k icons) loads without hang; index persists to IndexedDB.
  6. Offline reload serves the app shell.

## Out of scope (YAGNI)

- No backend / refresh-token flow (browser-only GIS, ~1-hour tokens accepted).
- No build step or framework.
- No offline caching of icon thumbnails (they stay live over the network).
- No keeping the Chrome extension alongside the PWA.
