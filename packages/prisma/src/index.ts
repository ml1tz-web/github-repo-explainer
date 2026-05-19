// Prisma client singleton.
//
// Why a singleton:
//   - Next.js / tsx hot-reload re-evaluates modules; without a global cache we
//     leak PrismaClient instances and exhaust the Postgres connection pool.
//   - In production we want a single long-lived client per process.
//
// The generated client is emitted to ../generated/client by `prisma generate`
// (see schema.prisma). Consumers import only from this barrel — never from
// the generated path directly.

import { PrismaClient } from '../generated/client/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createClient = (): PrismaClient =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : ['warn', 'error'],
  });

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export everything consumers might need so they import from one place.
export { Prisma, PrismaClient, AnalysisStatus } from '../generated/client/index.js';
export type { Analysis } from '../generated/client/index.js';
