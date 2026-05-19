// Public env validated at module load. Anything used in client components must
// be prefixed NEXT_PUBLIC_; Next inlines it at build time, so it's safe to read
// directly from `process.env` here.

import { z } from 'zod';

const schema = z.object({
  // Defaults to localhost so `pnpm dev` works without a .env file. Production
  // builds should set this explicitly — NEXT_PUBLIC_* vars are inlined at
  // build time, so an unset prod build would ship "http://localhost:4000" in
  // the bundle, which is rarely what you want.
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  /**
   * Optional override used only by server-side fetches. When running in
   * docker-compose, the web container reaches the api container at
   * http://api:4000, while the browser still uses NEXT_PUBLIC_API_URL.
   * Falls back to NEXT_PUBLIC_API_URL when unset.
   */
  API_URL: z.string().url().optional(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  API_URL: process.env.API_URL,
});

if (!parsed.success) {
  // Throwing at module init means Next surfaces the error in the build/dev
  // output with a clear stack — much better than a runtime undefined.
  throw new Error(
    `Invalid public env: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
  );
}

export const env = parsed.data;
