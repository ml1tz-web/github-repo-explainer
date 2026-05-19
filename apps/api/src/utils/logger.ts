import pino from 'pino';
import { env } from '../config/env.js';

// Pretty-print in dev for readable logs; pure JSON in prod for log shippers.
// Redact common secret-bearing fields to avoid accidental key leakage.
export const logger = pino({
  level: env.API_LOG_LEVEL,
  base: { service: 'api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      'ANTHROPIC_API_KEY',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', singleLine: false },
        },
      }
    : {}),
});

export type Logger = typeof logger;
