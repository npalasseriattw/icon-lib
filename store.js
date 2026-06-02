// Keys large enough to warrant async, high-quota storage go to IndexedDB.
// Everything else is tiny and lives in localStorage.
const INDEXED_KEYS = new Set(['iconIndex']);

const DB_NAME = 'iconlib';
const STORE_NAME = 'kv';

// ── localStorage backend (small values) ───────────────────────────
const localKv = {
  get(key) {
    const raw = localStorage.getItem(key);
    return Promise.resolve(raw == null ? null : JSON.parse(raw));
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return Promise.resolve();
  },
  remove(key) {
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

// ── IndexedDB backend (large values) ──────────────────────────────
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRequest(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

const idbKv = {
  async get(key) {
    const v = await idbRequest('readonly', (s) => s.get(key));
    return v === undefined ? null : v;
  },
  set(key, value) {
    return idbRequest('readwrite', (s) => s.put(value, key));
  },
  remove(key) {
    return idbRequest('readwrite', (s) => s.delete(key));
  },
};

// ── Router ─────────────────────────────────────────────────────────
export function makeStore({ kv, idb }) {
  const backend = (key) => (INDEXED_KEYS.has(key) ? idb : kv);
  return {
    get(key) {
      return backend(key).get(key);
    },
    set(key, value) {
      return backend(key).set(key, value);
    },
    remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Promise.all(list.map((k) => backend(k).remove(k))).then(() => {});
    },
  };
}

export const store = makeStore({ kv: localKv, idb: idbKv });
