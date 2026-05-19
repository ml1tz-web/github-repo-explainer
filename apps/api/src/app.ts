// Express app factory.
//
// This module is a *pure* builder — it doesn't listen on a port, doesn't
// touch process signals, doesn't read env beyond what middleware needs.
// That makes it usable from supertest without flake.
//
// index.ts wraps this factory with the server lifecycle (listen, signals,
// graceful shutdown).

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { mountRoutes } from './routes/index.js';

export const createApp = (): Express => {
  const app = express();

  // Trust the first proxy when deployed behind a reverse proxy (req.ip, etc).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers. CSP off for the API — it serves JSON, not HTML.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: false,
      methods: ['GET', 'POST', 'DELETE'],
    }),
  );

  app.use(express.json({ limit: '64kb' }));

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ reqId: (req as { id?: string }).id }),
      // Quiet successful health checks to keep logs readable.
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    }),
  );

  mountRoutes(app);

  // 404 must come AFTER routes; error handler must be LAST.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
