import { buildIndex } from '../lib/drive.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else { console.error(`  FAIL: ${message}`); failed++; }
}

// Mock listChildren returns a nested folder tree:
// root/
//   AWS/ (folder)
//     ec2.svg
//     s3.svg
//   logo.svg
async function mockListChildren(_token, folderId) {
  const tree = {
    'root': [
      { id: 'aws-folder', name: 'AWS', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'logo-file', name: 'logo.svg', mimeType: 'image/svg+xml' },
    ],
    'aws-folder': [
      { id: 'ec2-file', name: 'ec2.svg', mimeType: 'image/svg+xml' },
      { id: 's3-file', name: 's3.svg', mimeType: 'image/svg+xml' },
    ],
  };
  return tree[folderId] || [];
}

console.log('\nbuildIndex');
const index = await buildIndex('fake-token', 'root', mockListChildren);

assert(index.folders.length === 1, 'finds one subfolder');
assert(index.folders[0].id === 'aws-folder', 'subfolder has correct id');
assert(index.folders[0].name === 'AWS', 'subfolder has correct name');
assert(index.folders[0].parentId === 'root', 'subfolder has correct parentId');
assert(index.folders[0].path === 'AWS', 'subfolder has correct path');

assert(index.files.length === 3, 'finds all 3 files across nested folders');

const logo = index.files.find(f => f.id === 'logo-file');
assert(logo !== undefined, 'logo.svg found');
assert(logo.folderId === 'root', 'logo.svg has correct folderId');
assert(logo.path === '', 'root-level file has empty path');

const ec2 = index.files.find(f => f.id === 'ec2-file');
assert(ec2 !== undefined, 'ec2.svg found');
assert(ec2.folderId === 'aws-folder', 'ec2.svg has correct folderId');
assert(ec2.path === 'AWS', 'ec2.svg has correct path');

assert(typeof index.builtAt === 'number', 'builtAt is a number');
assert(index.rootFolderId === 'root', 'rootFolderId matches input');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
