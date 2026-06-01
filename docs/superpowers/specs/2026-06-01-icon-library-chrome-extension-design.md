# Icon Library Chrome Extension — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

A Chrome extension that surfaces icons stored in a Google Drive folder hierarchy as a browsable, searchable thumbnail grid. Users can drill into nested folders, find icons by filename, and copy them to the clipboard with a single click.

---

## Goals

- Browse icons stored in Google Drive from any Chrome window, without leaving the browser
- Navigate nested folder structures (e.g. `Cloud Service Providers / AWS / ec2.svg`)
- Search icons by filename across all folders instantly
- Copy any icon to the clipboard so it can be pasted into Slack, Notion, Figma, code editors, or any other tool
- Work reliably across sessions without re-authenticating or re-fetching the full index

## Non-Goals

- Uploading, renaming, or modifying icons in Drive
- Syncing icons to a local file system
- Supporting icon formats other than SVG and PNG
- Multi-account switching within the same session

---

## Architecture

A Manifest V3 Chrome extension. No backend, no server. Everything runs locally in the browser.

**Three components:**

| Component | File | Responsibility |
|---|---|---|
| Popup UI | `popup.html`, `popup.js` | Renders the grid, handles navigation, search, and copy |
| Service worker | `background.js` | Acquires and manages the OAuth token via `chrome.identity` |
| Persistent index | `chrome.storage.local` | Stores Drive file/folder metadata between sessions |

---

## Authentication

Two paths, tried in order on every popup open:

1. **Silent auth** (`chrome.identity.getAuthToken({ interactive: false })`)  
   Uses the Google account the user is signed into Chrome with. Succeeds silently on all subsequent opens after the initial consent. This is the primary path for normal use.

2. **Manual sign-in** (`chrome.identity.launchWebAuthFlow`)  
   Triggered when silent auth fails — typically in a Guest Chrome profile where no Google account is signed in. The popup shows a "Sign in with Google" button instead of the icon grid. Clicking it opens Google's OAuth popup. Once signed in, the token is stored for the session and the normal UI appears.

**OAuth scope:** `https://www.googleapis.com/auth/drive.readonly` (read-only access).

**First-time setup (one-time, done by the developer):**
1. Create a Google Cloud project
2. Enable the Google Drive API
3. Create an OAuth 2.0 client ID of type "Chrome Extension"
4. Enter the extension's Chrome Web Store ID (or unpacked extension ID during development)
5. Add the client ID to `manifest.json` under `"oauth2"`

After the extension is installed, the end user sees a single Google consent dialog on first use. All subsequent opens are silent.

---

## Configuration

The extension needs to know which Google Drive folder is the root of the icon library. This is a one-time setup step that happens after authentication.

**First-run flow:**
1. User authenticates (silent or manual sign-in)
2. If no root folder is configured yet, the popup shows a single input: "Paste your Google Drive folder URL or folder ID"
3. The folder ID is extracted from the URL (the last path segment of a Drive folder URL) and saved to `chrome.storage.local`
4. Index build begins immediately

A settings gear icon (⚙) in the popup header lets the user change the root folder at any time. Changing it clears the existing index and triggers a fresh build.

The folder ID is stored in `chrome.storage.local` under `"rootFolderId"` alongside the icon index.

---

## Data Flow

### Index Build (first open or manual refresh)

1. Popup requests an OAuth token from the service worker
2. Popup calls Drive API: `files.list` with `q: "'<rootFolderId>' in parents"` and `fields: "files(id, name, mimeType, parents)"`
3. For each subfolder returned, repeat recursively until all levels are traversed
4. Result is a flat array of file records and a folder tree, stored in `chrome.storage.local` with a timestamp
5. Typical cost: 3–8 API calls for a few hundred files across nested folders

### Subsequent Opens

- Index loads from `chrome.storage.local` — no Drive API call
- Cache is considered stale after 24 hours, at which point a background refresh runs automatically on next open
- User can also force a refresh via the Refresh button in the footer

### Browse

- Folder tree is built in memory from the cached index
- Navigating into a folder filters the in-memory list — no API call
- Breadcrumb tracks the current path; clicking any ancestor navigates back to that level

### Search

- Client-side filter over the flat file list, matching the query string against filenames (case-insensitive substring match)
- Runs on every keystroke with no debounce needed (purely in-memory)
- Results show each icon's folder path beneath the thumbnail so context is clear
- Search clears on pressing Escape or clicking the ✕ in the search bar

### Copy

1. User clicks an icon tile
2. Popup fetches the SVG file content from Drive: `files.get?fileId=<id>&alt=media` (one API call)
3. SVG is rendered to a `<canvas>` element to produce a PNG bitmap
4. Both are written to the clipboard simultaneously via `ClipboardItem`:
   - `image/png` — for pasting into Slack, Notion, Figma, email, etc.
   - `image/svg+xml` — for pasting into code editors or design tools that accept SVG
5. A "Copied!" toast appears on the tile for 1.5 seconds

---

## UI

### Popup dimensions

Fixed width: 380px. Height: auto, capped at ~520px with internal scroll on the icon grid.

### States

**Unauthenticated (guest profile)**
- Extension logo and title
- "Sign in with Google" button
- No icon grid visible

**Loading (index building on first open)**
- Search bar disabled
- Skeleton grid of placeholder tiles
- Status text: "Loading icons…"

**Root view**
- Header: logo, title, "Synced X ago" with green dot
- Search bar: "Search all icons…" placeholder
- Breadcrumb: "All icons"
- List of top-level folders with name, icon count, and chevron
- Footer: total icon count, Refresh button

**Folder view (drilled in)**
- Breadcrumb shows full path; each ancestor is clickable
- 5-column grid of icon thumbnails
- Each tile shows the filename beneath the icon
- Hover reveals a copy overlay (indigo tint + copy icon + "Copy" label)
- Footer: icon count in current folder, "Open in Drive →" link

**Search results**
- Breadcrumb replaced with: `Results for "<query>"` + ✕ Clear
- Flat grid of matching icons; each tile shows folder path beneath filename
- Footer: result count

### Icon tile interactions

| Action | Result |
|---|---|
| Hover | Copy overlay fades in |
| Click | Fetches SVG, copies to clipboard, shows "Copied!" toast |
| Click (offline) | Shows "Can't fetch icon — check your connection" inline error |

---

## Storage

**`chrome.storage.local` schema:**

```json
{
  "iconIndex": {
    "builtAt": 1748736000,
    "rootFolderId": "<drive-folder-id>",
    "folders": [
      { "id": "...", "name": "AWS", "parentId": "...", "path": "Cloud Service Providers/AWS" }
    ],
    "files": [
      { "id": "...", "name": "ec2.svg", "mimeType": "image/svg+xml", "folderId": "...", "path": "Cloud Service Providers/AWS" }
    ]
  }
}
```

SVG file content is never stored — it is fetched on demand at copy time and discarded.

**Storage budget:** ~200 bytes per file record. At 2,000 icons the index is ~400 KB, well within Chrome's 10 MB `storage.local` limit.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Auth fails silently (guest profile) | Show sign-in screen |
| Drive folder not found or permission denied | Inline error: "Can't access Drive folder." + Reconnect button (re-triggers auth) |
| Network offline, index cached | Browse and search work normally. Copy shows: "Can't fetch icon — check your connection." |
| Network offline, no cache | Error state: "No cached icons. Connect to the internet and refresh." |
| File is a PNG (not SVG) | Copy writes only `image/png`; skips `image/svg+xml` silently |
| Drive API rate limit hit | Retry once after 1 second; if still failing, show "Drive is unavailable, try again shortly." |

---

## Manifest Permissions

```json
{
  "permissions": ["identity", "storage", "clipboardWrite"],
  "host_permissions": ["https://www.googleapis.com/*"],
  "oauth2": {
    "client_id": "<your-client-id>.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
  }
}
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Extension manifest | Manifest V3 | Required for all new Chrome extensions |
| UI | Vanilla JS + HTML/CSS | No framework overhead needed for a single popup |
| Drive access | Google Drive API v3 | `files.list` + `files.get` cover all needed operations |
| Clipboard | Web Clipboard API (`ClipboardItem`) | Supports writing multiple MIME types in one call |
| Storage | `chrome.storage.local` | Persists across browser restarts; ~10 MB limit |
| Auth | `chrome.identity` | Native Chrome OAuth; handles token refresh automatically |

---

## File Structure

```
iconlib/
├── manifest.json
├── popup.html
├── popup.js
├── popup.css
├── background.js
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── lib/
    └── drive.js        # Drive API wrapper (files.list, files.get)
```

---

## Out of Scope for v1

- Pagination within large folders (deferred; folder-level grouping keeps grid manageable)
- Keyboard navigation (Tab + Enter to copy)
- Recently copied icons history
- Dark mode
- Pinning favourite icons
