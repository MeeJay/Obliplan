import './env';
import http from 'http';
import { createApp } from './app';
import { db } from './db';
import { config } from './config';
import { logger } from './utils/logger';
import { authService } from './services/auth.service';
import { tenantService } from './services/tenant.service';

async function main() {
  // 1. Run pending migrations.
  logger.info('Running database migrations...');
  await db.migrate.latest();
  logger.info('Migrations complete');

  // 2. Ensure the master tenant + default admin exist (local-auth bootstrap).
  await tenantService.ensureMasterTenant();
  await authService.ensureDefaultAdmin(config.defaultAdminUsername, config.defaultAdminPassword);

  // 3. HTTP server.
  const app = createApp();
  const server = http.createServer(app);

  server.listen(config.port, () => {
    logger.info(`Obliplan server listening on port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    server.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});
