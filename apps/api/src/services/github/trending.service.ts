// Trending public repos for the landing-page suggestion row.
//
// GitHub has no first-party "trending" API. We approximate with the Search
// API: highly-starred repos with recent pushes. Cached in-process for 1 hour
// (the rate limit for unauth requests is 60/hr per IP, so caching is what
// makes this safe).
//
// Resilient by design: any failure (HTTP error, JSON shape mismatch,
// rate limit) returns the last cached payload if we have one, else an empty
// list. The endpoint never throws — the landing page must keep rendering.

import type { TrendingRepo } from '@repo/shared';
import { logger } from '../../utils/logger.js';

const log = logger.child({ service: 'github-trending' });
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  data: TrendingRepo[];
  expiresAt: number;
}
let cache: CacheEntry | undefined;

export interface GetTrendingOptions {
  limit: number;
  /** Days back for the `pushed:>` query. Default 7. */
  windowDays?: number;
  /** Minimum stars. Default 1000. */
  minStars?: number;
}

export interface GetTrendingResult {
  repos: TrendingRepo[];
  cached: boolean;
}

export async function getTrending(opts: GetTrendingOptions): Promise<GetTrendingResult> {
  const limit = clamp(opts.limit, 1, 12);
  const now = Date.now();

  if (cache && cache.expiresAt > now) {
    return { repos: cache.data.slice(0, limit), cached: true };
  }

  try {
    const fresh = await fetchFromGithub({
      windowDays: opts.windowDays ?? 7,
      minStars: opts.minStars ?? 1000,
    });
    cache = { data: fresh, expiresAt: now + CACHE_TTL_MS };
    return { repos: fresh.slice(0, limit), cached: false };
  } catch (err) {
    log.warn({ err }, 'trending fetch failed; serving stale cache or empty');
    if (cache) {
      return { repos: cache.data.slice(0, limit), cached: true };
    }
    return { repos: [], cached: false };
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface GithubSearchItem {
  full_name?: string;
  owner?: { login?: string };
  name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
}
interface GithubSearchResponse {
  items?: GithubSearchItem[];
}

async function fetchFromGithub(opts: {
  windowDays: number;
  minStars: number;
}): Promise<TrendingRepo[]> {
  const since = new Date(Date.now() - opts.windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const q = `stars:>${opts.minStars} pushed:>${since}`;
  const url = `https://api.github.com/search/repositories?${new URLSearchParams({
    q,
    sort: 'updated',
    order: 'desc',
    per_page: '12',
  }).toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'github-repo-explainer',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`github search responded ${res.status}`);
    }
    const body = (await res.json()) as GithubSearchResponse;
    return (body.items ?? [])
      .map(toTrendingRepo)
      .filter((r): r is TrendingRepo => r !== null);
  } finally {
    clearTimeout(timer);
  }
}

function toTrendingRepo(item: GithubSearchItem): TrendingRepo | null {
  const owner = item.owner?.login;
  const name = item.name;
  const url = item.html_url;
  if (!owner || !name || !url) return null;
  return {
    owner,
    name,
    url,
    description: item.description ?? null,
    stars: item.stargazers_count ?? 0,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
