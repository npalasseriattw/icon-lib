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
  if (tokenClient) return tokenClient;
  // google.accounts.oauth2 is provided by the GIS script loaded in index.html.
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: CONFIG.scope,
    callback: () => {}, // replaced per-request below
  });
  return tokenClient;
}

// prompt: 'none' = silent (no UI, fails if interaction needed)
// prompt: ''     = interactive (consent shown only if not already granted)
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
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
