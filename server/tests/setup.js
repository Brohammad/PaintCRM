const { pool, closePool } = require('../lib/db');

// Test database configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/paintcrm_test';
process.env.JWT_SECRET = 'test-secret-for-jest-only';

// Global test setup
beforeAll(async () => {
  // Ensure test database exists and is clean
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Test database connection failed:', err.message);
    throw err;
  }
});

// Clean up after all tests
afterAll(async () => {
  await closePool();
});

// Clean tables between tests
global.cleanDatabase = async () => {
  await pool.query('TRUNCATE TABLE events, leads, tenants, shades RESTART IDENTITY CASCADE');
};
