import { store } from './store.js';

export const CONFIG = {
  scope: 'https://www.googleapis.com/auth/drive.readonly',
};

// The OAuth Client ID for a browser client is a public identifier, not a secret
// — but we deliberately keep it out of source control and store it per-browser
// instead. The user enters it on first run; it never leaves their machine.
// (Never store the client *secret* Google issues for a "Web application" client
// — the browser token flow does not use it.)
const CLIENT_ID_KEY = 'oauthClientId';

export async function getClientId() {
  const id = await store.get(CLIENT_ID_KEY);
  return id ? id.trim() : null;
}

export async function hasClientId() {
  return !!(await getClientId());
}

export async function setClientId(id) {
  await store.set(CLIENT_ID_KEY, id.trim());
  // Force the token client to rebuild against the new id.
  tokenClient = null;
  tokenClientId = null;
}

export async function clearClientId() {
  await store.remove(CLIENT_ID_KEY);
  tokenClient = null;
  tokenClientId = null;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

let tokenClient = null;
let tokenClientId = null;

async function ensureTokenClient() {
  const clientId = await getClientId();
  if (!clientId) {
    throw new Error('OAuth Client ID is not configured');
  }
  // google.accounts.oauth2 is provided by the GIS script loaded in index.html.
  if (tokenClient && tokenClientId === clientId) return tokenClient;
  tokenClientId = clientId;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
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
  const run = async () => {
    const client = await ensureTokenClient();
    return new Promise((resolve, reject) => {
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
  };
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
