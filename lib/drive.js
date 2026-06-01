const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchWithRetry(url, options) {
  const res = await fetch(url, options);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1000));
    const retry = await fetch(url, options);
    if (!retry.ok) throw new DriveError(retry.status, `Drive API error ${retry.status}`);
    return retry;
  }
  if (!res.ok) throw new DriveError(res.status, `Drive API error ${res.status}`);
  return res;
}

export async function listChildren(token, folderId) {
  const all = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetchWithRetry(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

export async function getFileContent(token, fileId) {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.text();
}

export async function getFileBlob(token, fileId) {
  const res = await fetchWithRetry(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.blob();
}

const ICON_MIME_TYPES = new Set(['image/svg+xml', 'image/png']);
const ICON_EXTENSIONS = /\.(svg|png)$/i;

export async function buildIndex(token, rootFolderId, listFn = listChildren) {
  const folders = [];
  const files = [];

  async function walk(folderId, pathPrefix) {
    const children = await listFn(token, folderId);
    const subFolders = [];
    for (const item of children) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const path = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
        folders.push({ id: item.id, name: item.name, parentId: folderId, path });
        subFolders.push({ id: item.id, path });
      } else if (ICON_MIME_TYPES.has(item.mimeType) || ICON_EXTENSIONS.test(item.name)) {
        files.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          folderId,
          path: pathPrefix,
        });
      }
    }
    // Walk sibling folders in parallel rather than sequentially
    await Promise.all(subFolders.map(f => walk(f.id, f.path)));
  }

  await walk(rootFolderId, '');
  return {
    folders,
    files,
    builtAt: Math.floor(Date.now() / 1000),
    rootFolderId,
  };
}
