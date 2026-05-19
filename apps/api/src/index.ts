// Process bootstrap: build the app, listen, handle signals, shut down cleanly.

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { prisma } from '@repo/prisma';

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, env: env.NODE_ENV },
    'api listening',
  );
});

// Graceful shutdown — stop accepting new connections, drain in-flight
// requests, then disconnect Prisma. Hard-exits after 10s to avoid hanging
// orchestrators on a stuck connection.
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutdown initiated');
  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, 'error closing http server');
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.error({ err }, 'error disconnecting prisma');
    }
    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  });
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
