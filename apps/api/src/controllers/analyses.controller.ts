import type { RequestHandler } from 'express';
import type { Analysis } from '@repo/prisma';
import type {
  AnalysisDto,
  AnalysisResult,
  CreateAnalysisResponse,
  RecentAnalysesResponse,
  RecentAnalysisDto,
} from '@repo/shared';

import { NotFoundError } from '../utils/errors.js';
import {
  analysisIdParamSchema,
  createAnalysisBodySchema,
} from '../validators/analyses.validator.js';
import { runAnalysis } from '../services/analysis/analysis.service.js';
import { analysisRepository } from '../repositories/analysis.repository.js';

// POST /api/v1/analyses
// Body: { url: string }
// Synchronous: blocks until the pipeline finishes (or a cache hit returns
// immediately). Typical wall time 5-40s on a cache miss.
export const createAnalysis: RequestHandler = async (req, res) => {
  const { url } = createAnalysisBodySchema.parse(req.body);
  const { analysis, cached } = await runAnalysis({ parsedUrl: url, signal: req.signal });
  const body: CreateAnalysisResponse = { analysis: toDto(analysis), cached };
  res.status(cached ? 200 : 201).json(body);
};

// GET /api/v1/analyses/:id
export const getAnalysis: RequestHandler = async (req, res) => {
  const { id } = analysisIdParamSchema.parse(req.params);
  const row = await analysisRepository.findById(id);
  if (!row) throw new NotFoundError('Analysis');
  res.json({ analysis: toDto(row) });
};

// GET /api/v1/analyses/recent?limit=N
// Powers the "Recently analyzed" row on the landing page. Returns a slim
// projection — full results aren't needed for chips.
export const getRecentAnalyses: RequestHandler = async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 12) : 4;
  const rows = await analysisRepository.findRecentCompleted(limit);
  const body: RecentAnalysesResponse = {
    analyses: rows.map(toRecentDto),
  };
  res.json(body);
};

function toRecentDto(row: Analysis): RecentAnalysisDto {
  const result = row.result as AnalysisResult | null;
  return {
    id: row.id,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    summary: result?.summary ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DTO mapping. Prisma Date → ISO string; JsonValue → typed result.
// ---------------------------------------------------------------------------

function toDto(row: Analysis): AnalysisDto {
  return {
    id: row.id,
    repoUrl: row.repoUrl,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    commitSha: row.commitSha,
    defaultBranch: row.defaultBranch,
    status: row.status,
    // We validated against analysisResultSchema before writing, so the cast
    // is safe. Anything older that pre-dates the schema would have a
    // mismatched `version` and the frontend can guard on that.
    result: (row.result as AnalysisResult | null) ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
