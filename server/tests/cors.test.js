const { parseAllowedOrigins, createCorsOriginDelegate } = require('../lib/cors');

function ask(delegate, origin) {
  return new Promise((resolve) => {
    delegate(origin, (_err, allowed) => resolve(allowed));
  });
}

describe('parseAllowedOrigins', () => {
  it('returns null for empty / whitespace', () => {
    expect(parseAllowedOrigins(undefined)).toBeNull();
    expect(parseAllowedOrigins('')).toBeNull();
    expect(parseAllowedOrigins('  ,  ')).toBeNull();
  });

  it('splits and trims a comma-separated list', () => {
    expect(parseAllowedOrigins(' https://a.example ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

describe('createCorsOriginDelegate', () => {
  it('allows missing Origin (curl / same-origin)', async () => {
    const denyProd = createCorsOriginDelegate({ allowedOrigins: null, nodeEnv: 'production' });
    expect(await ask(denyProd, undefined)).toBe(true);
  });

  it('denies cross-origin in production when ALLOWED_ORIGINS is unset', async () => {
    const denyProd = createCorsOriginDelegate({ allowedOrigins: null, nodeEnv: 'production' });
    expect(await ask(denyProd, 'https://evil.example')).toBe(false);
  });

  it('allows any origin in non-production when unset', async () => {
    const openDev = createCorsOriginDelegate({ allowedOrigins: null, nodeEnv: 'development' });
    expect(await ask(openDev, 'http://localhost:5173')).toBe(true);
  });

  it('allows only listed origins when configured', async () => {
    const allow = createCorsOriginDelegate({
      allowedOrigins: ['https://paintcrm.brohammad.tech'],
      nodeEnv: 'production',
    });
    expect(await ask(allow, 'https://paintcrm.brohammad.tech')).toBe(true);
    expect(await ask(allow, 'https://evil.example')).toBe(false);
  });

  it('honours explicit *', async () => {
    const star = createCorsOriginDelegate({ allowedOrigins: ['*'], nodeEnv: 'production' });
    expect(await ask(star, 'https://anywhere.example')).toBe(true);
  });
});
