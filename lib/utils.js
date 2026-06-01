export function extractFolderIdFromUrl(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function filterFiles(files, query) {
  if (!query) return files;
  const q = query.toLowerCase();
  return files.filter(f => f.name.toLowerCase().includes(q));
}

export function formatTimeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function isCacheStale(builtAt) {
  return Math.floor(Date.now() / 1000) - builtAt > 86400;
}
