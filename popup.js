import { extractFolderIdFromUrl, formatTimeAgo, isCacheStale } from './lib/utils.js';
import { buildIndex, getFileContent, getFileBlob, DriveError } from './lib/drive.js';
import { store } from './store.js';
import { getToken, signIn } from './auth.js';

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

// ── Configuration ──────────────────────────────────────────────────
async function loadRootFolderId() {
  return store.get('rootFolderId');
}

async function saveRootFolderId(id) {
  return store.set('rootFolderId', id);
}

// ── Entry point ────────────────────────────────────────────────────
async function init() {
  let token = await getToken();

  if (!token) {
    showView('view-auth');
    document.getElementById('btn-signin').addEventListener('click', async () => {
      try {
        token = await signIn();
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

document.getElementById('btn-settings').addEventListener('click', async () => {
  await store.remove(['rootFolderId', 'iconIndex']);
  state.index = null;
  showConfigureView();
  const t = await getToken();
  if (t) state.token = t;
});

document.getElementById('btn-reconnect').addEventListener('click', () => {
  signIn().then(async (token) => {
    state.token = token;
    await afterAuth();
  }).catch((err) => {
    showErrorView(`Reconnect failed: ${err.message}`, true);
  });
});

// ── Index management ───────────────────────────────────────────────
const CACHE_KEY = 'iconIndex';

async function loadCachedIndex() {
  return store.get(CACHE_KEY);
}

async function saveCachedIndex(index) {
  return store.set(CACHE_KEY, index);
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
    updateSyncBadge(index.builtAt);
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

async function handleDriveError(err, rootFolderId) {
  if (err instanceof DriveError) {
    if (err.status === 401) {
      await store.remove(['guestToken', 'guestTokenExpiry']);
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

// ── Thumbnail semaphore — cap concurrent SVG fetches ───────────────
const thumbSem = (() => {
  const LIMIT = 6;
  let active = 0;
  const queue = [];
  return {
    async acquire() {
      if (active < LIMIT) { active++; return; }
      return new Promise(resolve => queue.push(resolve));
    },
    release() {
      active--;
      if (queue.length) { active++; queue.shift()(); }
    },
  };
})();

const GRID_PAGE_SIZE = 100;

// ── Rendering ──────────────────────────────────────────────────────
function renderMain() {
  state.currentFolderId = null;
  state.breadcrumb = [];
  state.searchQuery = '';
  showView('view-main');
  document.getElementById('search-input').value = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  updateSyncBadge(state.index.builtAt);
  renderRoot();
  searchBound = false;
  bindSearchInput();
}

function renderRoot() {
  state.currentFolderId = null;
  renderBreadcrumb([{ id: null, name: 'All icons', isCurrent: true }]);

  const topFolders = state.index.folders.filter(f => f.parentId === state.index.rootFolderId);
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (topFolders.length === 0) {
    renderIconGrid(state.index.files, content, false);
    setFooter(`${state.index.files.length} icons`, null, null);
    return;
  }

  const list = document.createElement('div');
  list.className = 'folder-list';

  for (const folder of topFolders) {
    const count = countIconsInFolder(folder.id);
    const hasSubFolders = state.index.folders.some(f => f.parentId === folder.id);
    const countLabel = hasSubFolders ? `${countFolders(folder.id)} folders` : `${count} icons`;
    list.appendChild(makeFolderRow(folder, countLabel));
  }

  content.appendChild(list);

  const total = state.index.files.length;
  const folderCount = topFolders.length;
  setFooter(`${folderCount} folders · ${total} icons total`, null, null);
}

function renderFolder(folderId) {
  state.currentFolderId = folderId;

  const crumbs = buildCrumbPath(folderId);
  renderBreadcrumb(crumbs);

  const content = document.getElementById('content');
  content.innerHTML = '';

  const subFolders = state.index.folders.filter(f => f.parentId === folderId);
  if (subFolders.length > 0) {
    const list = document.createElement('div');
    list.className = 'folder-list';
    for (const sub of subFolders) {
      const count = countIconsInFolder(sub.id);
      list.appendChild(makeFolderRow(sub, `${count} icons`));
    }
    content.appendChild(list);
  }

  const files = state.index.files.filter(f => f.folderId === folderId);
  if (files.length > 0) {
    renderIconGrid(files, content, false);
  }

  const driveUrl = `https://drive.google.com/drive/folders/${folderId}`;
  setFooter(
    `${files.length} icons${subFolders.length > 0 ? ` · ${subFolders.length} subfolders` : ''}`,
    'Open in Drive →',
    () => window.open(driveUrl, '_blank', 'noopener')
  );
}

function renderSearch(query) {
  state.searchQuery = query;

  const matched = state.index.files.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  const crumb = document.getElementById('breadcrumb');
  crumb.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'bc-item current';
  span.textContent = `Results for "${query}"`;
  crumb.appendChild(span);
  const clearSpan = document.createElement('span');
  clearSpan.className = 'bc-clear';
  clearSpan.textContent = '✕ Clear';
  clearSpan.addEventListener('click', clearSearch);
  crumb.appendChild(clearSpan);

  const content = document.getElementById('content');
  content.innerHTML = '';
  renderIconGrid(matched, content, true);
  setFooter(`${matched.length} result${matched.length !== 1 ? 's' : ''} for "${query}"`, null, null);
}

// ── Helpers ────────────────────────────────────────────────────────
function countIconsInFolder(folderId) {
  const subFolderIds = getAllSubFolderIds(folderId);
  return state.index.files.filter(f =>
    f.folderId === folderId || subFolderIds.has(f.folderId)
  ).length;
}

function countFolders(folderId) {
  return state.index.folders.filter(f => f.parentId === folderId).length;
}

function getAllSubFolderIds(folderId) {
  const ids = new Set();
  const queue = [folderId];
  while (queue.length) {
    const id = queue.shift();
    for (const f of state.index.folders) {
      if (f.parentId === id && !ids.has(f.id)) { ids.add(f.id); queue.push(f.id); }
    }
  }
  return ids;
}

function buildCrumbPath(folderId) {
  const crumbs = [];
  let current = state.index.folders.find(f => f.id === folderId);
  while (current) {
    crumbs.unshift({ id: current.id, name: current.name });
    const parent = state.index.folders.find(f => f.id === current.parentId);
    current = parent;
  }
  const result = [{ id: null, name: 'All icons' }, ...crumbs];
  result[result.length - 1].isCurrent = true;
  return result;
}

function renderBreadcrumb(crumbs) {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  crumbs.forEach((crumb, i) => {
    const span = document.createElement('span');
    span.textContent = crumb.name;
    span.className = `bc-item${crumb.isCurrent ? ' current' : ''}`;
    if (!crumb.isCurrent) {
      span.addEventListener('click', () => {
        if (crumb.id === null) renderRoot();
        else renderFolder(crumb.id);
      });
    }
    el.appendChild(span);
    if (i < crumbs.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
  });
}

function makeFolderRow(folder, countLabel) {
  const row = document.createElement('div');
  row.className = 'folder-row';
  row.innerHTML = `
    <div class="folder-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="1.8" width="16" height="16">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
    <span class="folder-name">${escapeHtml(folder.name)}</span>
    <span class="folder-count">${countLabel}</span>
    <svg class="folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  `;
  row.addEventListener('click', () => renderFolder(folder.id));
  return row;
}

function renderIconGrid(files, container, showPath) {
  let offset = 0;

  function renderPage() {
    const grid = document.createElement('div');
    grid.className = 'icon-grid';
    const page = files.slice(offset, offset + GRID_PAGE_SIZE);
    for (const file of page) {
      grid.appendChild(makeIconTile(file, showPath));
    }
    container.appendChild(grid);
    offset += GRID_PAGE_SIZE;

    if (offset < files.length) {
      const btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.textContent = `Show more (${files.length - offset} remaining)`;
      btn.addEventListener('click', () => { btn.remove(); renderPage(); }, { once: true });
      container.appendChild(btn);
    }
  }

  renderPage();
}

function makeIconTile(file, showPath) {
  const tile = document.createElement('div');
  tile.className = 'icon-tile';
  tile.dataset.fileId = file.id;
  tile.dataset.mimeType = file.mimeType;

  const nameWithoutExt = file.name.replace(/\.(svg|png)$/i, '');

  const img = document.createElement('img');
  img.alt = nameWithoutExt;
  img.width = 28;
  img.height = 28;
  img.style.objectFit = 'contain';

  if (file.mimeType === 'image/svg+xml') {
    // Lazy-load: only fetch SVG content when tile scrolls into view,
    // and cap concurrent requests via semaphore to avoid flooding Drive API.
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      thumbSem.acquire().then(() =>
        getFileContent(state.token, file.id)
          .then(svgText => {
            const blob = new Blob([svgText], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            img.onload = () => URL.revokeObjectURL(url);
            img.onerror = () => { URL.revokeObjectURL(url); img.style.display = 'none'; };
            img.src = url;
          })
          // Hide the tile on any fetch failure. A 401 here is intentionally
          // swallowed rather than surfaced — the next browse/copy action routes
          // through handleDriveError and offers Reconnect, so we avoid spamming
          // the error view from dozens of concurrent thumbnail loads.
          .catch(() => { img.style.display = 'none'; })
          .finally(() => thumbSem.release())
      );
    }, { rootMargin: '100px' });
    observer.observe(tile);
  } else {
    img.src = `https://drive.google.com/thumbnail?id=${file.id}&sz=w64`;
    img.onerror = () => { img.style.display = 'none'; };
  }

  const overlay = document.createElement('div');
  overlay.className = 'copy-overlay';
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="13" height="13">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    Copy
  `;

  tile.appendChild(img);
  tile.appendChild(overlay);

  if (showPath) {
    const pathEl = document.createElement('div');
    pathEl.className = 'tile-path';
    pathEl.textContent = file.path;
    tile.appendChild(pathEl);
  }

  const nameEl = document.createElement('div');
  nameEl.className = 'tile-name';
  nameEl.textContent = nameWithoutExt;
  tile.appendChild(nameEl);

  tile.addEventListener('click', () => handleCopy(file.id, file.mimeType, tile));
  return tile;
}

function setFooter(countText, actionLabel, actionFn) {
  document.getElementById('footer-count').textContent = countText;
  const actionEl = document.getElementById('footer-action');
  actionEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'footer-link';
  if (actionLabel && actionFn) {
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionFn);
  } else {
    btn.textContent = '↻ Refresh';
    btn.addEventListener('click', refreshIndex);
  }
  actionEl.appendChild(btn);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Search & Refresh ───────────────────────────────────────────────
let searchBound = false;
function bindSearchInput() {
  if (searchBound) return;
  searchBound = true;

  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('btn-clear-search');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.classList.toggle('hidden', !q);
    if (q) {
      renderSearch(q);
    } else {
      if (state.currentFolderId) renderFolder(state.currentFolderId);
      else renderRoot();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSearch();
  });

  clearBtn.addEventListener('click', clearSearch);
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('btn-clear-search').classList.add('hidden');
  state.searchQuery = '';
  if (state.currentFolderId) renderFolder(state.currentFolderId);
  else renderRoot();
}

async function refreshIndex() {
  const rootFolderId = state.index?.rootFolderId ?? await loadRootFolderId();
  if (!rootFolderId) return;
  showView('view-loading');
  document.getElementById('loading-label').textContent = 'Refreshing icons…';
  try {
    const index = await buildIndex(state.token, rootFolderId);
    await saveCachedIndex(index);
    state.index = index;
    renderMain();
  } catch (err) {
    handleDriveError(err, rootFolderId);
  }
}

// ── Copy ───────────────────────────────────────────────────────────
async function svgToPng(svgText, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG failed to load')); };
    img.src = url;
  });
}

async function handleCopy(fileId, mimeType, tileEl) {
  if (!navigator.onLine) {
    showTileError(tileEl, "Can't fetch — offline");
    return;
  }

  // Cancel any in-flight toast timer from a previous rapid click
  if (tileEl._toastTimer) { clearTimeout(tileEl._toastTimer); tileEl._toastTimer = null; }

  tileEl.classList.add('copying');
  const overlay = tileEl.querySelector('.copy-overlay');
  if (overlay.lastChild) overlay.lastChild.textContent = '…';

  let succeeded = false;
  try {
    if (mimeType === 'image/png') {
      const pngBlob = await getFileBlob(state.token, fileId);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } else {
      const svgText = await getFileContent(state.token, fileId);
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const pngBlob = await svgToPng(svgText);
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/svg+xml': svgBlob,
          'image/png': pngBlob,
        }),
      ]);
    }
    succeeded = true;
    showCopiedToast(tileEl);
  } catch (err) {
    handleDriveError(err, state.index?.rootFolderId);
    if (overlay.lastChild) overlay.lastChild.textContent = 'Copy';
  } finally {
    // On success, showCopiedToast owns the 'copying' class lifecycle
    if (!succeeded) tileEl.classList.remove('copying');
  }
}

function showCopiedToast(tileEl) {
  const overlay = tileEl.querySelector('.copy-overlay');
  if (overlay.lastChild) overlay.lastChild.textContent = 'Copied!';
  tileEl._toastTimer = setTimeout(() => {
    tileEl._toastTimer = null;
    tileEl.classList.remove('copying');
    if (overlay.lastChild) overlay.lastChild.textContent = 'Copy';
  }, 1500);
}

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

document.addEventListener('DOMContentLoaded', init);
