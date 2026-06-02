import { store } from './store.js';

export const CONFIG = {
  // Replace with your Google Cloud "Web application" OAuth client ID (Task 9).
  clientId: 'REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com',
  scope: 'https://www.googleapis.com/auth/drive.readonly',
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

let tokenClient = null;

function ensureTokenClient() {
  if (CONFIG.clientId.startsWith('REPLACE_WITH')) {
    throw new Error('auth.js: clientId is not configured — set CONFIG.clientId to your Web application OAuth client ID');
  }
  if (tokenClient) return tokenClient;
  // google.accounts.oauth2 is provided by the GIS script loaded in index.html.
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: CONFIG.scope,
    callback: () => {}, // replaced per-request below
  });
  return tokenClient;
}

// The GIS token client is a singleton with a mutable per-request callback, so
// concurrent calls would clobber each other. Chain requests through `pending`
// to guarantee one runs at a time.
let pending = null;

// prompt: 'none' = silent (no UI, fails if interaction needed)
// prompt: ''     = interactive (consent shown only if not already granted)
function requestToken(prompt) {
  const run = () => new Promise((resolve, reject) => {
    const client = ensureTokenClient();
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      resolve(resp);
    };
    client.error_callback = (err) => reject(new Error(err?.type ?? 'auth_failed'));
    try {
      client.requestAccessToken({ prompt });
    } catch (err) {
      reject(err);
    }
  });
  // Run after any in-flight request settles (success OR failure), so one failed
  // request never blocks the queue.
  pending = (pending ?? Promise.resolve()).then(run, run);
  return pending;
}

async function acquire(prompt) {
  const resp = await requestToken(prompt);
  const expiry = nowSeconds() + (resp.expires_in ?? 3600);
  await store.set('guestToken', resp.access_token);
  await store.set('guestTokenExpiry', expiry);
  return resp.access_token;
}

// Returns a valid token without forcing UI, or null if sign-in is required.
export async function getToken() {
  const token = await store.get('guestToken');
  const expiry = await store.get('guestTokenExpiry');
  if (token && expiry && expiry > nowSeconds()) return token;
  try {
    return await acquire('none');
  } catch {
    return null;
  }
}

// Interactive sign-in. Must be called from a user gesture.
export async function signIn() {
  return acquire('');
}

export async function signOut() {
  const token = await store.get('guestToken');
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  await store.remove(['guestToken', 'guestTokenExpiry']);
}
