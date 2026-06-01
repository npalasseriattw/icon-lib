import { extractFolderIdFromUrl, filterFiles, formatTimeAgo, isCacheStale } from '../lib/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// extractFolderIdFromUrl
console.log('\nextractFolderIdFromUrl');
assert(
  extractFolderIdFromUrl('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'extracts ID from full Drive URL'
);
assert(
  extractFolderIdFromUrl('https://drive.google.com/drive/u/0/folders/1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'extracts ID from Drive URL with /u/0/'
);
assert(
  extractFolderIdFromUrl('1aBcDeFgHiJkLmN') === '1aBcDeFgHiJkLmN',
  'returns plain ID unchanged'
);
assert(
  extractFolderIdFromUrl('  1aBcDeFgHiJkLmN  ') === '1aBcDeFgHiJkLmN',
  'trims whitespace from plain ID'
);
assert(
  extractFolderIdFromUrl('not a valid input') === null,
  'returns null for invalid input'
);
assert(
  extractFolderIdFromUrl('short') === null,
  'returns null for string shorter than 10 chars'
);

// filterFiles
console.log('\nfilterFiles');
const files = [
  { id: '1', name: 'ec2.svg', mimeType: 'image/svg+xml', folderId: 'f1', path: 'AWS' },
  { id: '2', name: 'S3-icon.svg', mimeType: 'image/svg+xml', folderId: 'f1', path: 'AWS' },
  { id: '3', name: 'compute-engine.svg', mimeType: 'image/svg+xml', folderId: 'f2', path: 'GCP' },
];
assert(filterFiles(files, 's3').length === 1, 'case-insensitive match');
assert(filterFiles(files, 's3')[0].name === 'S3-icon.svg', 'returns correct file');
assert(filterFiles(files, 'svg').length === 3, 'matches all files containing "svg"');
assert(filterFiles(files, '').length === 3, 'empty query returns all files');
assert(filterFiles(files, 'zzz').length === 0, 'no match returns empty array');

// formatTimeAgo
console.log('\nformatTimeAgo');
const now = Math.floor(Date.now() / 1000);
assert(formatTimeAgo(now - 30) === 'just now', 'under 60s shows "just now"');
assert(formatTimeAgo(now - 90) === '1m ago', '90 seconds shows "1m ago"');
assert(formatTimeAgo(now - 3700) === '1h ago', '3700 seconds shows "1h ago"');
assert(formatTimeAgo(now - 90000) === '1d ago', '90000 seconds shows "1d ago"');

// isCacheStale
console.log('\nisCacheStale');
assert(isCacheStale(now - 90000) === true, 'timestamp 25 hours ago is stale');
assert(isCacheStale(now - 3600) === false, 'timestamp 1 hour ago is not stale');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
