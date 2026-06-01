import { extractFolderIdFromUrl, formatTimeAgo, isCacheStale } from './lib/utils.js';
import { buildIndex, DriveError } from './lib/drive.js';

// ── State ──────────────────────────────────────────────────────────
const state = {
  token: null,
  index: null,   // { folders, files, builtAt, rootFolderId }
  currentFolderId: null,  // null = root
  breadcrumb: [], // [{ id, name }]
  searchQuery: '',
};

// ── View switching ─────────────────────────────────────────────────
const VIEWS = ['view-auth', 'view-configure', 'view-loading', 'view-error', 'view-main'];

function showView(name) {
  for (const id of VIEWS) {
    document.getElementById(id).classList.toggle('hidden', id !== name);
  }
  const showHeader = name === 'view-main' || name === 'view-loading';
  document.getElementById('header').classList.toggle('hidden', !showHeader);
}

// ── Auth ───────────────────────────────────────────────────────────
async function getSilentToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(chrome.runtime.lastError || !token ? null : token);
    });
  });
}

async function getInteractiveToken() {
  // Try Chrome account first (shows consent screen once)
  const token = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      resolve(chrome.runtime.lastError || !token ? null : token);
    });
  });
  if (token) return token;

  // Fallback: web auth flow for guest profiles
  return webAuthFlow();
}

async function webAuthFlow() {
  const { client_id } = chrome.runtime.getManifest().oauth2;
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth cancelled'));
        return;
      }
      const hash = new URL(redirectedTo).hash.slice(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);
      if (!token) { reject(new Error('No access token in response')); return; }

      // Store guest token (not managed by Chrome identity)
      const expiry = Math.floor(Date.now() / 1000) + expiresIn;
      chrome.storage.local.set({ guestToken: token, guestTokenExpiry: expiry });
      resolve(token);
    });
  });
}

async function loadStoredGuestToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['guestToken', 'guestTokenExpiry'], (result) => {
      const { guestToken, guestTokenExpiry } = result;
      if (guestToken && guestTokenExpiry > Math.floor(Date.now() / 1000)) {
        resolve(guestToken);
      } else {
        resolve(null);
      }
    });
  });
}

// ── Configuration ──────────────────────────────────────────────────
async function loadRootFolderId() {
  return new Promise((resolve) => {
    chrome.storage.local.get('rootFolderId', (r) => resolve(r.rootFolderId ?? null));
  });
}

async function saveRootFolderId(id) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ rootFolderId: id }, resolve);
  });
}

// ── Entry point ────────────────────────────────────────────────────
async function init() {
  // 1. Try silent auth
  let token = await getSilentToken();

  // 2. Try stored guest token
  if (!token) token = await loadStoredGuestToken();

  if (!token) {
    // Show sign-in screen
    showView('view-auth');
    document.getElementById('btn-signin').addEventListener('click', async () => {
      try {
        token = await getInteractiveToken();
        state.token = token;
        await afterAuth();
      } catch (err) {
        showErrorView(`Sign-in failed: ${err.message}`, true);
      }
    });
    return;
  }

  state.token = token;
  await afterAuth();
}

async function afterAuth() {
  const rootFolderId = await loadRootFolderId();
  if (!rootFolderId) {
    showConfigureView();
  } else {
    await loadAndShowIndex(rootFolderId);
  }
}

function showConfigureView() {
  showView('view-configure');

  const input = document.getElementById('input-folder-url');
  const errorEl = document.getElementById('configure-error');
  const btn = document.getElementById('btn-save-folder');

  btn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');
    const folderId = extractFolderIdFromUrl(input.value);
    if (!folderId) {
      errorEl.textContent = 'Invalid URL or folder ID — paste the full Drive folder URL.';
      errorEl.classList.remove('hidden');
      return;
    }
    await saveRootFolderId(folderId);
    await loadAndShowIndex(folderId);
  }, { once: true });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  }, { once: true });
}

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.storage.local.remove(['rootFolderId', 'iconIndex'], () => {
    state.index = null;
    showConfigureView();
    getSilentToken().then(t => { if (t) state.token = t; });
  });
});

document.getElementById('btn-reconnect').addEventListener('click', () => {
  getInteractiveToken().then(async (token) => {
    state.token = token;
    await afterAuth();
  }).catch((err) => {
    showErrorView(`Reconnect failed: ${err.message}`, true);
  });
});

// ── Index management ───────────────────────────────────────────────
const CACHE_KEY = 'iconIndex';

async function loadCachedIndex() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CACHE_KEY, (r) => resolve(r[CACHE_KEY] ?? null));
  });
}

async function saveCachedIndex(index) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: index }, resolve);
  });
}

async function loadAndShowIndex(rootFolderId) {
  showView('view-loading');
  updateSyncBadge(null);

  let index = await loadCachedIndex();

  if (index && index.rootFolderId === rootFolderId && !isCacheStale(index.builtAt)) {
    state.index = index;
    renderMain();
    return;
  }

  document.getElementById('loading-label').textContent = 'Loading icons from Drive…';
  try {
    index = await buildIndex(state.token, rootFolderId);
    await saveCachedIndex(index);
    state.index = index;
    renderMain();
  } catch (err) {
    handleDriveError(err, rootFolderId);
  }
}

function updateSyncBadge(builtAt) {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  if (!builtAt) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  label.textContent = `Synced ${formatTimeAgo(builtAt)}`;
}

function showErrorView(message, showReconnect = false) {
  showView('view-error');
  document.getElementById('error-message').textContent = message;
  document.getElementById('btn-reconnect').classList.toggle('hidden', !showReconnect);
}

function handleDriveError(err, rootFolderId) {
  if (err instanceof DriveError) {
    if (err.status === 401) {
      chrome.storage.local.remove(['guestToken', 'guestTokenExpiry']);
      showErrorView('Session expired. Please reconnect.', true);
    } else if (err.status === 403 || err.status === 404) {
      showErrorView("Can't access Drive folder. Check the folder exists and is shared with your account.", true);
    } else {
      showErrorView('Drive is unavailable, try again shortly.', false);
    }
  } else if (!navigator.onLine) {
    if (state.index) {
      renderMain();
    } else {
      showErrorView('No cached icons. Connect to the internet and refresh.', false);
    }
  } else {
    showErrorView(`Unexpected error: ${err.message}`, false);
  }
}

function renderMain() {
  // Implemented in Task 7
}

document.addEventListener('DOMContentLoaded', init);
