// Orchestrator for the analysis pipeline.
//
//   1. Resolve HEAD SHA via `git ls-remote` (cheap, no clone yet)
//   2. Cache lookup by (repoUrl, commitSha) — return existing row on hit
//   3. Clone → scan → select → summarize
//   4. Persist as COMPLETED. Handle the create-race via unique-violation refetch.
//   5. cleanup() the clone in finally — temp dir is always removed.
//
// We deliberately only insert when the analysis is COMPLETED. No PENDING /
// RUNNING bookkeeping. Failures throw; the error middleware returns a 4xx/5xx.
// (Schema still has those enums — they're future-proofing for a queue worker.)

import { performance } from 'node:perf_hooks';
import { ANALYSIS_RESULT_VERSION, type AnalysisResult, type ParsedGithubUrl } from '@repo/shared';
import type { Analysis } from '@repo/prisma';

import { logger } from '../../utils/logger.js';
import { RepoNotFoundError } from '../../utils/errors.js';
import { analysisRepository, isUniqueViolation } from '../../repositories/analysis.repository.js';
import { cloneRepo, resolveHeadSha } from './git-clone.service.js';
import { scanRepo } from './repo-scanner.service.js';
import { selectFiles } from './file-selector.service.js';
import { summarizeRepo } from './ai-summarizer.service.js';

const log = logger.child({ service: 'analysis-orchestrator' });

export interface RunAnalysisInput {
  parsedUrl: ParsedGithubUrl;
  signal?: AbortSignal;
}

export interface RunAnalysisOutput {
  analysis: Analysis;
  /** true if returned from cache; false if freshly computed. */
  cached: boolean;
}

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisOutput> {
  const { normalized: repoUrl, owner: repoOwner, repo: repoName } = input.parsedUrl;
  const signal = input.signal;

  // --- 1. Resolve HEAD SHA ----------------------------------------------------
  const head = await resolveHeadSha(repoUrl, signal);
  if (!head) throw new RepoNotFoundError(repoUrl);
  const { sha: commitSha, defaultBranch: remoteBranch } = head;

  // --- 2. Cache check ---------------------------------------------------------
  const cached = await analysisRepository.findByRepoAndSha(repoUrl, commitSha);
  if (cached) {
    log.info({ id: cached.id, repoUrl, commitSha }, 'cache hit');
    return { analysis: cached, cached: true };
  }

  // --- 3. Pipeline ------------------------------------------------------------
  const startedAt = performance.now();
  const clone = await cloneRepo({ repoUrl, signal });

  try {
    const scan = await scanRepo(clone.dir, { rootName: repoName });
    const select = await selectFiles(clone.dir, scan.files);

    log.info(
      {
        repoUrl,
        commitSha,
        scanned: scan.stats.filesScanned,
        selected: select.stats.filesSelected,
        tokensEstimate: select.stats.tokensEstimate,
      },
      'pipeline: scan + select complete',
    );

    const ai = await summarizeRepo({
      repoUrl,
      defaultBranch: clone.defaultBranch || remoteBranch,
      commitSha: clone.commitSha,
      tree: scan.tree,
      files: select.selected,
      scanStats: scan.stats,
      selectStats: select.stats,
      signal,
    });

    // --- 4. Stitch + persist --------------------------------------------------
    const result: AnalysisResult = {
      version: ANALYSIS_RESULT_VERSION,
      tree: scan.tree,
      ...ai.partial,
    };

    const durationMs = Math.round(performance.now() - startedAt);

    try {
      const row = await analysisRepository.createCompleted({
        repoUrl,
        repoOwner,
        repoName,
        commitSha: clone.commitSha,
        defaultBranch: clone.defaultBranch || remoteBranch,
        result,
        tokensInput: ai.tokensInput,
        tokensOutput: ai.tokensOutput,
        durationMs,
      });
      log.info({ id: row.id, durationMs, tokensInput: ai.tokensInput }, 'analysis stored');
      return { analysis: row, cached: false };
    } catch (err) {
      // Concurrent request beat us to it. Return their row instead of failing.
      if (isUniqueViolation(err)) {
        const existing = await analysisRepository.findByRepoAndSha(repoUrl, clone.commitSha);
        if (existing) {
          log.info({ id: existing.id }, 'lost create race — returning existing row');
          return { analysis: existing, cached: true };
        }
      }
      throw err;
    }
  } finally {
    // Idempotent — safe to call regardless of which stage threw.
    await clone.cleanup();
  }
}
