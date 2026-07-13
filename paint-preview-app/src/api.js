// Network + token layer for the backend API.
//
// Access tokens are short-lived; a long-lived refresh token (also in
// localStorage) is used to transparently mint a new access token when a request
// comes back 401. The refresh is de-duplicated so a burst of concurrent 401s
// only triggers a single /auth/refresh round-trip.

// Empty base => all paths are relative, so the app works whether it is served
// by the Express server or opened directly from disk (offline, no sync).
export const API_BASE = '';
export const API_TOKEN_KEY = 'paintcrm_api_token_v1';
export const REFRESH_TOKEN_KEY = 'paintcrm_api_refresh_v1';
export const API_TENANT_KEY = 'paintcrm_api_tenant_v1';

const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

export function getApiToken() {
  try { return localStorage.getItem(API_TOKEN_KEY) || null; } catch { return null; }
}
export function setApiToken(t) {
  try { if (t) localStorage.setItem(API_TOKEN_KEY, t); } catch { /* storage full */ }
}
export function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_TOKEN_KEY) || null; } catch { return null; }
}
export function setRefreshToken(t) {
  try { if (t) localStorage.setItem(REFRESH_TOKEN_KEY, t); } catch { /* storage full */ }
}

// Persists an access/refresh token pair returned by login/register/refresh.
export function setSession(payload) {
  const { token, refreshToken } = payload || {};
  setApiToken(token);
  setRefreshToken(refreshToken);
}

export function clearTokens() {
  try {
    localStorage.removeItem(API_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(API_TENANT_KEY);
  } catch { /* nothing */ }
}

// Lets the app reset its own UI/state when a session can no longer be refreshed.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = typeof fn === 'function' ? fn : null;
}

async function rawRequest(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Single shared in-flight refresh so parallel 401s don't stampede /auth/refresh.
let refreshInFlight = null;
async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = rawRequest('POST', '/api/auth/refresh', { refreshToken })
      .then(({ res, data }) => {
        if (res.ok && data.token) {
          setSession({ token: data.token, refreshToken: data.refreshToken });
          return data.token;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// Primary request helper. Returns { data, error } — never throws.
export async function apiRequest(method, path, body) {
  try {
    const token = getApiToken();
    let { res, data } = await rawRequest(method, path, body, token);

    // Transparent refresh-on-401 (retried at most once), skipping auth routes.
    if (res.status === 401 && token && !NO_REFRESH_PATHS.includes(path)) {
      const newToken = await tryRefresh();
      if (newToken) {
        ({ res, data } = await rawRequest(method, path, body, newToken));
      } else {
        clearTokens();
        if (unauthorizedHandler) unauthorizedHandler();
      }
    }

    if (!res.ok) return { data: null, error: data.error || `HTTP ${res.status}` };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message || 'Network error' };
  }
}
