// In-memory rate limiter keyed by IP. Good enough for a single-instance MVP.
// When we scale horizontally, swap the default memory store for a Redis store
// — express-rate-limit accepts a `store` option without touching call sites.

import rateLimit from 'express-rate-limit';

/**
 * 10 requests / minute / IP. Each analysis is expensive (clone + AI call),
 * so we limit aggressively. GETs are cheap and unlimited.
 */
export const analysisCreateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many analyses started. Please slow down and try again in a minute.',
    },
  },
});
