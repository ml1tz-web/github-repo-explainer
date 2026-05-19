import type { Express } from 'express';
import { healthRouter } from './health.routes.js';
import { analysesRouter } from './analyses.routes.js';

// Single mount point for all routers. Versioning lives here: all feature
// routes go under /api/v1 so we can introduce /api/v2 later without breaking
// existing clients. /health is intentionally unversioned (it's an infra
// concern, not part of the public API).
export const mountRoutes = (app: Express): void => {
  app.use('/health', healthRouter);
  app.use('/api/v1/analyses', analysesRouter);
};
