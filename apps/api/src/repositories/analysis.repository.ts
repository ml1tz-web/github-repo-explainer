// The single place Prisma is imported.
//
// Services call this repository; controllers never touch it. The Json column
// `result` is typed loosely by Prisma but we validate against the zod schema
// in @repo/shared before write, so reads can safely cast.

import { prisma, Prisma, type Analysis, AnalysisStatus } from '@repo/prisma';
import type { AnalysisResult } from '@repo/shared';

export interface CreateAnalysisInput {
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  commitSha: string;
  defaultBranch: string;
  result: AnalysisResult;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
}

export const analysisRepository = {
  findById(id: string): Promise<Analysis | null> {
    return prisma.analysis.findUnique({ where: { id } });
  },

  findByRepoAndSha(repoUrl: string, commitSha: string): Promise<Analysis | null> {
    return prisma.analysis.findUnique({
      where: { repoUrl_commitSha: { repoUrl, commitSha } },
    });
  },

  /**
   * Insert a completed analysis. Throws Prisma.PrismaClientKnownRequestError
   * with code 'P2002' if a row already exists for the same (repoUrl, commitSha)
   * — caller treats this as "lost the race" and refetches.
   */
  createCompleted(input: CreateAnalysisInput): Promise<Analysis> {
    return prisma.analysis.create({
      data: {
        repoUrl: input.repoUrl,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        commitSha: input.commitSha,
        defaultBranch: input.defaultBranch,
        status: AnalysisStatus.COMPLETED,
        result: input.result as unknown as Prisma.InputJsonValue,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
        durationMs: input.durationMs,
      },
    });
  },
};

/** Type guard for the unique constraint violation raised by createCompleted. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
