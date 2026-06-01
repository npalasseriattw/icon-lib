# Icon Library

A Chrome extension that lets you browse, search, and copy icons stored in a Google Drive folder — directly from your browser toolbar.

## What it does

- **Browse** icons organised in nested Google Drive folders
- **Search** by filename across all folders instantly
- **Copy** any icon to the clipboard with one click — pastes as an image in Slack, Notion, Figma, email, etc., and as SVG source code in code editors
- **Persists** your folder index locally so subsequent opens are instant

---

## Prerequisites

- Google Chrome (version 114 or later)
- A Google account with access to the Drive folder containing your icons
- A Google Cloud project with the Drive API enabled (one-time setup — see below)

---

## One-time Google Cloud Setup

Before installing, you need to create an OAuth client ID so the extension can access Google Drive.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (e.g. "Icon Library")
2. Navigate to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**
3. Navigate to **APIs & Services → Credentials**, click **Create Credentials → OAuth 2.0 Client ID**
4. Set **Application type** to **Chrome Extension**
5. Leave the Extension ID field blank for now — you'll fill it in after loading the extension (step 4 below)
6. Click **Create** and copy the **Client ID**

---

## Installation

### Step 1 — Download the extension

Clone or download this repository:

```bash
git clone git@github.com:npalasseriattw/icon-lib.git
```

Or download the ZIP from GitHub and unzip it.

### Step 2 — Add your Client ID

Open `manifest.json` in the downloaded folder and replace the placeholder with your Client ID from the Google Cloud step above:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
  ...
}
```

### Step 3 — Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `iconlib` folder (the one containing `manifest.json`)

The extension will appear in your toolbar. Note the **Extension ID** shown under the extension name — it looks like `abcdefghijklmnopqrstuvwxyzabcdef`.

### Step 4 — Register the Extension ID with Google Cloud

1. Go back to your OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com)
2. Edit the client and paste your Extension ID into the **Application ID** field
3. Save

### Step 5 — Pin the extension (optional)

Click the puzzle-piece icon in the Chrome toolbar and pin **Icon Library** for easy access.

---

## First use

1. Click the Icon Library icon in the toolbar
2. You'll be prompted to **sign in with Google** — click the button and approve Drive read access (this happens once)
3. Paste your **Google Drive folder URL** into the input field and click **Connect folder**
   - Example: `https://drive.google.com/drive/folders/1ABC_xyz-123`
4. The extension indexes your icons and shows them in a thumbnail grid

---

## Usage

| Action | How |
|---|---|
| Browse folders | Click any folder to drill in; use the breadcrumb to go back |
| Search | Type in the search bar — results update instantly across all folders |
| Clear search | Press `Escape` or click ✕ |
| Copy an icon | Click any icon tile — pastes as image and SVG |
| Refresh icons | Click **↻ Refresh** in the footer to re-sync from Drive |
| Change folder | Click the ⚙ icon in the header |

---

## Keeping icons up to date

The extension caches your folder index for 24 hours. It refreshes automatically on the next open after the cache expires. To force an immediate refresh, click **↻ Refresh** in the footer.

---

## Troubleshooting

**"Can't access Drive folder"**
Check that the folder URL is correct and your Google account has access to it.

**"Session expired. Please reconnect."**
Click **Reconnect** to re-authenticate. This happens occasionally when the OAuth token expires.

**Icons not showing thumbnails**
SVG thumbnails are fetched directly from Drive. If you see blank tiles, check your internet connection and try refreshing.

**Extension not loading in Chrome**
Make sure Developer mode is enabled at `chrome://extensions` and that you selected the correct folder (the one containing `manifest.json`).
