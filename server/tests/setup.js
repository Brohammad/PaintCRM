// Configure the environment BEFORE requiring lib/db (it builds the pool from
// DATABASE_URL at require time, so this must run first).
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/paintcrm_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-only';

// Pure unit tests that never touch Postgres / HTTP. Keeping this list short and
// explicit lets contributors run helper suites without a local database.
const PURE_UNIT_TESTS = new Set([
  'cors.test.js',
  'ai-heuristic.test.js',
  'ai-recommend.test.js',
  'notify.test.js',
  'reminders-job.test.js',
]);

function currentTestFile() {
  try {
    return path.basename(expect.getState().testPath || '');
  } catch {
    return '';
  }
}

function isPureUnitTest() {
  return PURE_UNIT_TESTS.has(currentTestFile());
}

let pool;
let closePool = async () => {};

// Global test setup
beforeAll(async () => {
  if (isPureUnitTest()) {
    global.__paintcrmSkipDb = true;
    return;
  }

  ({ pool, closePool } = require('../lib/db'));

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Test database connection failed:', err.message);
    throw err;
  }
});

afterAll(async () => {
  if (global.__paintcrmSkipDb) return;
  await closePool();
});

// Clean tables between integration tests
global.cleanDatabase = async () => {
  if (global.__paintcrmSkipDb || !pool) {
    throw new Error('cleanDatabase() called from a pure unit test (no DB)');
  }
  await pool.query(
    'TRUNCATE TABLE password_reset_tokens, refresh_tokens, payment_reminders, ledger_entries, inventory_movements, inventory_items, order_items, orders, quote_items, quotes, preview_sessions, leads, sites, customers, events, tenants, shades RESTART IDENTITY CASCADE'
  );
};
