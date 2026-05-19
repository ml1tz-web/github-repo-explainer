import type { RequestHandler } from 'express';
import { prisma } from '@repo/prisma';
import { logger } from '../utils/logger.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  checks: {
    db: 'ok' | 'down';
  };
}

// Liveness + readiness in one. The DB check uses SELECT 1 (cheap, no
// dependency on schema state). If the DB is down we still return 200 with
// status='degraded' so external probes can distinguish "process alive" from
// "fully ready" — adjust to 503 if your load balancer needs that signal.
export const getHealth: RequestHandler = async (_req, res) => {
  let db: 'ok' | 'down' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    db = 'down';
    logger.warn({ err }, 'health: database check failed');
  }

  const body: HealthResponse = {
    status: db === 'ok' ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { db },
  };
  res.json(body);
};
