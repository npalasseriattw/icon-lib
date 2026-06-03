// Per-browser cache of fetched icon bytes, keyed by Drive fileId and validated
// against the file's modifiedTime so it auto-refreshes when an icon changes.
// This is an optimization only — every miss/error falls back to a live fetch.
const DB_NAME = 'iconlib-thumbs';
const STORE_NAME = 'thumbs';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

async function idbRequest(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

const idbBackend = {
  async get(id) {
    const v = await idbRequest('readonly', (s) => s.get(id));
    return v === undefined ? null : v;
  },
  put(id, record) {
    return idbRequest('readwrite', (s) => s.put(record, id));
  },
};

// Backend contract: get(id) resolves to the stored record or null (never undefined);
// put(id, record) resolves when stored. Errors may reject; the cache swallows them.
export function makeThumbCache({ get, put }) {
  return {
    // Returns { modifiedTime, type, data } when the cached entry's modifiedTime
    // matches; otherwise null (miss). Never throws.
    async getThumb(fileId, modifiedTime) {
      try {
        const rec = await get(fileId);
        if (rec && rec.modifiedTime === modifiedTime) return rec;
        return null;
      } catch {
        return null;
      }
    },
    // Stores bytes for a file. Never throws (cache is best-effort).
    async putThumb(fileId, modifiedTime, type, data) {
      try {
        await put(fileId, { modifiedTime, type, data });
      } catch {
        /* best-effort cache; ignore quota/abort/unavailable */
      }
    },
  };
}

export const thumbCache = makeThumbCache(idbBackend);
