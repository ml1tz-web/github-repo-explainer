// HTTP wire types shared between API and web client.
// Keep these dependency-free (no zod imports) — they describe the JSON shape,
// not validation. The API validates inputs with zod and serializes to these
// shapes; the web client treats them as the response contract.

import type { AnalysisResult } from '../schemas/analysis';

export type AnalysisStatusDto = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AnalysisDto {
  id: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  commitSha: string;
  defaultBranch: string | null;
  status: AnalysisStatusDto;
  result: AnalysisResult | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface CreateAnalysisRequest {
  url: string;
}

export interface CreateAnalysisResponse {
  analysis: AnalysisDto;
  /** true if returned from cache (same repo + SHA already analyzed). */
  cached: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation issues (only for 400s from zod). */
    issues?: Array<{ path: string; message: string }>;
  };
}

// ---------------------------------------------------------------------------
// Landing-page suggestion endpoints
// ---------------------------------------------------------------------------

export interface RecentAnalysisDto {
  id: string;
  repoOwner: string;
  repoName: string;
  /** Optional one-liner pulled from the result summary. */
  summary: string | null;
  createdAt: string;
}

export interface RecentAnalysesResponse {
  analyses: RecentAnalysisDto[];
}

export interface TrendingRepo {
  owner: string;
  name: string;
  url: string;
  description: string | null;
  stars: number;
}

export interface TrendingResponse {
  repos: TrendingRepo[];
  /** True if the response came from cache (≤ 1 hour old). */
  cached: boolean;
}
