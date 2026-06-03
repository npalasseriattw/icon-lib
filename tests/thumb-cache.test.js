import { makeThumbCache } from '../thumb-cache.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

function memBackend() {
  const m = new Map();
  return {
    get: (id) => Promise.resolve(m.has(id) ? m.get(id) : null),
    put: (id, record) => { m.set(id, record); return Promise.resolve(); },
    _map: m,
  };
}

console.log('\nthumbCache');
const backend = memBackend();
const cache = makeThumbCache(backend);

// store + hit on matching modifiedTime
await cache.putThumb('a', 'T1', 'image/svg+xml', '<svg/>');
const hit = await cache.getThumb('a', 'T1');
assert(hit !== null, 'returns a record on modifiedTime match');
assert(hit.data === '<svg/>', 'record carries the stored data');
assert(hit.type === 'image/svg+xml', 'record carries the stored type');

// miss on modifiedTime mismatch (icon changed in Drive)
assert((await cache.getThumb('a', 'T2')) === null, 'returns null when modifiedTime differs');

// miss on unknown key
assert((await cache.getThumb('missing', 'T1')) === null, 'returns null for unknown key');

// getThumb swallows backend errors to null
const throwing = { get: () => Promise.reject(new Error('idb down')), put: () => Promise.resolve() };
assert((await makeThumbCache(throwing).getThumb('a', 'T1')) === null, 'getThumb swallows backend errors');

// putThumb swallows backend errors (no throw)
let threw = false;
try {
  await makeThumbCache({ get: () => Promise.resolve(null), put: () => Promise.reject(new Error('quota')) })
    .putThumb('a', 'T1', 'image/png', new Uint8Array());
} catch { threw = true; }
assert(!threw, 'putThumb swallows backend errors');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
