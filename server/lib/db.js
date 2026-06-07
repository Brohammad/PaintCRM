const { Pool } = require('pg');
const { dbQueryDuration } = require('./metrics');

const sslConfig = (() => {
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }
  return false;
})();

const config = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/paintcrm',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: sslConfig,
};

const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

async function checkHealth() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return { healthy: true, latency: Date.now() };
  } catch (err) {
    return { healthy: false, error: err.message };
  } finally {
    client.release();
  }
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function query(text, params) {
  const queryType = text.trim().split(/\s+/)[0].toUpperCase();
  const end = dbQueryDuration.startTimer({ query_type: queryType });
  try {
    const result = await pool.query(text, params);
    end();
    return result;
  } catch (err) {
    end();
    console.error('Query error', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, checkHealth, closePool };
