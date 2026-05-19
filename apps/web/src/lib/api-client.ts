// Typed wrapper around fetch.
//
// All HTTP calls to the API go through this module. It:
//   - resolves the base URL from public env
//   - serializes/deserializes JSON
//   - turns non-2xx responses into typed ApiClientError instances
//   - never throws raw fetch errors at callers
//
// Higher-level helpers (analyses, etc.) live as named exports below — keep
// them thin, one function per endpoint.

import type {
  ApiErrorBody,
  AnalysisDto,
  CreateAnalysisRequest,
  CreateAnalysisResponse,
  RecentAnalysesResponse,
  TrendingResponse,
} from '@repo/shared';
import { env } from '@/config/env';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ApiErrorBody['error']['issues'],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (err) {
    // Network failure, CORS, abort — give callers something typed.
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network request failed',
    );
  }

  // 204 / empty body: nothing to parse.
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const errBody = data as Partial<ApiErrorBody> | null;
    const code = errBody?.error?.code ?? 'UNKNOWN_ERROR';
    const message = errBody?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiClientError(res.status, code, message, errBody?.error?.issues);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

export const apiClient = {
  createAnalysis: (input: CreateAnalysisRequest, signal?: AbortSignal) =>
    request<CreateAnalysisResponse>('/api/v1/analyses', {
      method: 'POST',
      body: input,
      signal,
    }),

  getAnalysis: (id: string, signal?: AbortSignal) =>
    request<{ analysis: AnalysisDto }>(`/api/v1/analyses/${encodeURIComponent(id)}`, {
      signal,
    }),

  getRecentAnalyses: (limit: number, signal?: AbortSignal) =>
    request<RecentAnalysesResponse>(`/api/v1/analyses/recent?limit=${limit}`, { signal }),

  getTrending: (limit: number, signal?: AbortSignal) =>
    request<TrendingResponse>(`/api/v1/github/trending?limit=${limit}`, { signal }),
};
