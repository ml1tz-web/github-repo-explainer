// Boot-time environment validation.
//
// Importing this module has a side effect: if any required env var is missing
// or malformed, `process.exit(1)` is called with a human-readable error.
// This is intentional — we want failures *before* the HTTP server starts
// listening, not when the first request hits a code path that touches the
// bad config.

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),

  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  CLONE_TMP_DIR: z.string().default('./tmp/clones'),
  CLONE_MAX_REPO_SIZE_MB: z.coerce.number().int().positive().default(200),
  CLONE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
