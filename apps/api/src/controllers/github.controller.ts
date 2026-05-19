import type { RequestHandler } from 'express';
import type { TrendingResponse } from '@repo/shared';
import { getTrending } from '../services/github/trending.service.js';

// GET /api/v1/github/trending?limit=N
// Approximates GitHub trending via the Search API. The service handles its
// own caching and failure semantics; this controller is a thin pass-through.
export const getTrendingRepos: RequestHandler = async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 12) : 4;
  const { repos, cached } = await getTrending({ limit });
  const body: TrendingResponse = { repos, cached };
  res.json(body);
};
