/**
 * CORS origin resolution.
 *
 * Production must set ALLOWED_ORIGINS explicitly (comma-separated).
 * Development / test remain permissive so local tooling keeps working.
 */

function parseAllowedOrigins(envValue) {
  if (envValue === null || envValue === undefined) return null;
  const list = String(envValue)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * Returns a cors `origin` delegate.
 * @param {{ allowedOrigins: string[]|null, nodeEnv: string }} opts
 */
function createCorsOriginDelegate({ allowedOrigins, nodeEnv }) {
  const isProd = nodeEnv === 'production';

  return function corsOrigin(origin, callback) {
    // Same-origin navigation and non-browser clients omit Origin.
    if (!origin) return callback(null, true);

    if (!allowedOrigins) {
      if (isProd) return callback(null, false);
      return callback(null, true);
    }

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

module.exports = { parseAllowedOrigins, createCorsOriginDelegate };
