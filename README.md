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

## Local development

To run the app on your machine, serve the folder over HTTP (a `file://` URL won't work — service workers and GIS require a real origin):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Add `http://localhost:8000` to your OAuth client's **Authorised JavaScript origins** (alongside the production origin) so sign-in works locally. `localhost` is treated as a secure context, so the service worker, clipboard, and install prompt all behave as they do in production.

## Using the app

1. Open the hosted URL in Chrome.
2. Click the install icon in the address bar (or **⋮ → Install Icon Library**) to add it as an app.
3. Click **Sign in**, authorise Drive read-only access.
4. Paste the URL of your Drive icons folder when prompted.
5. Browse, search, and click any icon to copy it.

## Notes

- Sign-in uses Google Identity Services entirely in the browser — no backend, no stored secrets. Access tokens last about an hour; re-authorising is usually a single click.
- The icon index is cached in IndexedDB; use the **↻ Refresh** action to re-sync after adding icons in Drive.
