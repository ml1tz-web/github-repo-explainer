import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@repo/shared';
import { logger } from '../utils/logger.js';
import { AppError, isAppError } from '../utils/errors.js';

// Single funnel for all errors. Maps:
//   - ZodError    → 400 VALIDATION_ERROR with issues
//   - AppError    → its declared status + safe payload
//   - everything else → 500 INTERNAL_ERROR (details only in logs)
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = logger.child({ reqId: req.id });

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    log.warn({ issues }, 'request validation failed');
    const body: ApiErrorBody = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues },
    };
    res.status(400).json(body);
    return;
  }

  if (isAppError(err)) {
    // Client errors (4xx) are routine — log at info. Server errors get warn+.
    const level = err.status >= 500 ? 'error' : 'info';
    log[level](
      { code: err.code, status: err.status, cause: err.cause },
      err.message,
    );
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, issues: err.issues },
    };
    res.status(err.status).json(body);
    return;
  }

  // Unknown error — log everything, return nothing identifiable.
  log.error({ err }, 'unhandled error');
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
  res.status(500).json(body);
};
