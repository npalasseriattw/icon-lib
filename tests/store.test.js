import { makeStore } from '../store.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

function memBackend() {
  const m = new Map();
  return {
    get: (k) => Promise.resolve(m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, v); return Promise.resolve(); },
    remove: (k) => { m.delete(k); return Promise.resolve(); },
    _map: m,
  };
}

console.log('\nmakeStore routing');
const kv = memBackend();
const idb = memBackend();
const store = makeStore({ kv, idb });

await store.set('rootFolderId', 'abc');
await store.set('guestToken', 'tok');
await store.set('iconIndex', { files: [1, 2, 3] });

assert(kv._map.get('rootFolderId') === 'abc', 'small key routes to kv backend');
assert(kv._map.get('guestToken') === 'tok', 'token routes to kv backend');
assert(!kv._map.has('iconIndex'), 'iconIndex does NOT go to kv backend');
assert(idb._map.has('iconIndex'), 'iconIndex routes to idb backend');

assert((await store.get('rootFolderId')) === 'abc', 'reads small key back');
assert((await store.get('iconIndex')).files.length === 3, 'reads iconIndex back from idb');
assert((await store.get('missing')) === null, 'missing key returns null');

await store.remove(['rootFolderId', 'iconIndex']);
assert(!kv._map.has('rootFolderId'), 'remove clears kv key');
assert(!idb._map.has('iconIndex'), 'remove clears idb key');

await store.set('guestToken', 'tok2');
await store.remove('guestToken');
assert(!kv._map.has('guestToken'), 'remove accepts a single string key');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
