const { Pool } = require('pg');
const path = require('path');

// Database configuration
const config = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/paintcrm',
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not established
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create pool
const pool = new Pool(config);

// Pool event handlers for monitoring
pool.on('connect', (client) => {
  console.log('New database connection established');
});

pool.on('acquire', (client) => {
  console.log('Client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('Client removed from pool');
});

pool.on('error', (err, client) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Health check function
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

// Transaction helper
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

// Query helper with logging
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    return result;
  } catch (err) {
    console.error('Query error', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
}

// Graceful shutdown
async function closePool() {
  console.log('Closing database pool...');
  await pool.end();
  console.log('Database pool closed');
}

module.exports = {
  pool,
  query,
  withTransaction,
  checkHealth,
  closePool
};
