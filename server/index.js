// Load environment variables
require('dotenv').config();

// Refuse to start in production without a real JWT secret
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret === 'dev_secret_change_me' || secret === 'change_this_in_production') {
    console.error('FATAL: JWT_SECRET must be set to a secure value in production. Refusing to start.');
    process.exit(1);
  }
  if (secret.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters in production. Refusing to start.');
    process.exit(1);
  }
}

const app = require('./app');
const { closePool } = require('./lib/db');

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`PaintCRM server running → http://localhost:${PORT}`);
  console.log(`  API base: http://localhost:${PORT}/api`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  Metrics: http://localhost:${PORT}/metrics`);
  console.log(`  Login: http://localhost:${PORT}/login`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await closePool();
      console.log('Database connections closed');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});
