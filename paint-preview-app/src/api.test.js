import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiRequest,
  getApiToken,
  getRefreshToken,
  setApiToken,
  setSession,
  clearTokens,
  setUnauthorizedHandler,
} from './api.js';

function fakeRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('api token storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips the access token', () => {
    setApiToken('abc');
    expect(getApiToken()).toBe('abc');
  });

  it('setSession stores both tokens; clearTokens removes them', () => {
    setSession({ token: 'a', refreshToken: 'r' });
    expect(getApiToken()).toBe('a');
    expect(getRefreshToken()).toBe('r');
    clearTokens();
    expect(getApiToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns data on a 2xx response', async () => {
    global.fetch = vi.fn(() => Promise.resolve(fakeRes(200, { customers: [1, 2] })));
    const { data, error } = await apiRequest('GET', '/api/customers');
    expect(error).toBeNull();
    expect(data).toEqual({ customers: [1, 2] });
  });

  it('surfaces the server error message on a non-2xx response', async () => {
    global.fetch = vi.fn(() => Promise.resolve(fakeRes(400, { error: 'Bad input' })));
    const { data, error } = await apiRequest('POST', '/api/customers', {});
    expect(data).toBeNull();
    expect(error).toBe('Bad input');
  });

  it('attaches the bearer token when present', async () => {
    setApiToken('tok');
    global.fetch = vi.fn(() => Promise.resolve(fakeRes(200, {})));
    await apiRequest('GET', '/api/auth/me');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  it('transparently refreshes on 401 and retries the original request', async () => {
    setSession({ token: 'old', refreshToken: 'r1' });
    global.fetch = vi.fn((url, opts) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(fakeRes(200, { token: 'new', refreshToken: 'r2' }));
      }
      const bearer = opts.headers.Authorization;
      if (bearer === 'Bearer old') return Promise.resolve(fakeRes(401, { error: 'expired' }));
      return Promise.resolve(fakeRes(200, { ok: true }));
    });

    const { data, error } = await apiRequest('GET', '/api/customers');
    expect(error).toBeNull();
    expect(data).toEqual({ ok: true });
    expect(getApiToken()).toBe('new');
    expect(getRefreshToken()).toBe('r2');
  });

  it('clears tokens and notifies when the refresh fails', async () => {
    setSession({ token: 'old', refreshToken: 'r1' });
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/refresh') return Promise.resolve(fakeRes(401, { error: 'nope' }));
      return Promise.resolve(fakeRes(401, { error: 'expired' }));
    });

    const { error } = await apiRequest('GET', '/api/customers');
    expect(error).toBeTruthy();
    expect(getApiToken()).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to refresh the login endpoint itself', async () => {
    global.fetch = vi.fn(() => Promise.resolve(fakeRes(401, { error: 'Invalid credentials' })));
    const { error } = await apiRequest('POST', '/api/auth/login', { email: 'x', password: 'y' });
    expect(error).toBe('Invalid credentials');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
