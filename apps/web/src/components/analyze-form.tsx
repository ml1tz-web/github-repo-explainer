'use client';

// Landing-page form. Validates with the shared zod schema, posts to the API,
// navigates to /analyze/[id] on success. Maps API error codes to friendly
// messages so the user sees "Repository not found" instead of an HTTP code.
//
// Two suggestion rows live below the input:
//   - Recently analyzed: links straight to /analyze/[id] (cache demo — instant)
//   - Trending: fills the input; user still presses Analyze (a real pipeline run)

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  githubUrlSchema,
  type RecentAnalysisDto,
  type TrendingRepo,
} from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError, apiClient } from '@/lib/api-client';

type FormState =
  | { status: 'idle' }
  | { status: 'submitting'; message: string }
  | { status: 'error'; message: string };

const STAGE_MESSAGES = [
  'Resolving repository…',
  'Cloning…',
  'Scanning files…',
  'Analyzing with Claude…',
];

// Curated fallback shown when /trending is empty AND no recents exist
// (fresh deploy, GitHub down, etc.). Mix of sizes, all recognizable.
const FALLBACK_TRENDING: TrendingRepo[] = [
  { owner: 'expressjs', name: 'express', url: 'https://github.com/expressjs/express', description: null, stars: 0 },
  { owner: 'tj', name: 'commander.js', url: 'https://github.com/tj/commander.js', description: null, stars: 0 },
  { owner: 'vercel', name: 'swr', url: 'https://github.com/vercel/swr', description: null, stars: 0 },
  { owner: 'sindresorhus', name: 'p-limit', url: 'https://github.com/sindresorhus/p-limit', description: null, stars: 0 },
];

const SUGGESTION_LIMIT = 4;

export function AnalyzeForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [state, setState] = useState<FormState>({ status: 'idle' });
  const [recent, setRecent] = useState<RecentAnalysisDto[]>([]);
  const [trending, setTrending] = useState<TrendingRepo[]>([]);

  // Fetch suggestions on mount. Both calls are independent — Promise.allSettled
  // means a failing /trending doesn't kill /recent and vice versa.
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.allSettled([
      apiClient.getRecentAnalyses(SUGGESTION_LIMIT, ctrl.signal),
      apiClient.getTrending(SUGGESTION_LIMIT, ctrl.signal),
    ]).then(([recentRes, trendingRes]) => {
      if (recentRes.status === 'fulfilled') setRecent(recentRes.value.analyses);
      if (trendingRes.status === 'fulfilled' && trendingRes.value.repos.length > 0) {
        setTrending(trendingRes.value.repos);
      } else {
        setTrending(FALLBACK_TRENDING);
      }
    });
    return () => ctrl.abort();
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const parsed = githubUrlSchema.safeParse(url);
    if (!parsed.success) {
      setState({
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Invalid URL',
      });
      return;
    }

    setState({ status: 'submitting', message: STAGE_MESSAGES[0]! });

    // Rotate the progress copy while the request is in flight. Pure UX —
    // the API gives us one response when everything is done; this just
    // tells the user we're alive.
    const ticker = startStageTicker((msg) =>
      setState((s) => (s.status === 'submitting' ? { ...s, message: msg } : s)),
    );

    try {
      const res = await apiClient.createAnalysis({ url: parsed.data.normalized });
      router.push(`/analyze/${res.analysis.id}`);
    } catch (err) {
      setState({ status: 'error', message: friendlyMessage(err) });
    } finally {
      ticker.stop();
    }
  };

  const isError = state.status === 'error';
  const isBusy = state.status === 'submitting';

  return (
    <form onSubmit={onSubmit} className="w-full max-w-2xl space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state.status === 'error') setState({ status: 'idle' });
          }}
          aria-invalid={isError}
          aria-describedby={isError ? 'analyze-error' : undefined}
          disabled={isBusy}
          className="flex-1"
        />
        <Button type="submit" size="lg" disabled={isBusy || url.trim().length === 0}>
          {isBusy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {isBusy ? 'Analyzing…' : 'Analyze'}
        </Button>
      </div>

      {isError && (
        <p id="analyze-error" role="alert" className="text-sm text-[var(--color-destructive)]">
          {state.message}
        </p>
      )}

      {isBusy && (
        <p className="text-sm text-[var(--color-muted-foreground)]">{state.message}</p>
      )}

      <div className="flex flex-col gap-2 pt-2 text-xs">
        {recent.length > 0 && (
          <SuggestionRow label="Recently analyzed">
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/analyze/${r.id}`}
                title={r.summary ?? undefined}
                className={chipClasses}
              >
                {r.repoOwner}/{r.repoName}
              </Link>
            ))}
          </SuggestionRow>
        )}
        {trending.length > 0 && (
          <SuggestionRow label="Trending">
            {trending.map((t) => (
              <button
                key={t.url}
                type="button"
                onClick={() => {
                  setUrl(t.url);
                  if (state.status === 'error') setState({ status: 'idle' });
                }}
                disabled={isBusy}
                title={t.description ?? undefined}
                className={`${chipClasses} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {t.owner}/{t.name}
              </button>
            ))}
          </SuggestionRow>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function friendlyMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'VALIDATION_ERROR':
        return err.issues?.[0]?.message ?? 'That URL doesn’t look right.';
      case 'REPO_NOT_FOUND':
        return 'Repository not found. Make sure it’s public and the URL is correct.';
      case 'REPO_TOO_LARGE':
        return 'This repository is too large to analyze.';
      case 'CLONE_TIMEOUT':
        return 'Cloning took too long. Try a smaller repository.';
      case 'AI_SUMMARIZATION_FAILED':
        return 'The analysis service had trouble. Please try again in a moment.';
      case 'RATE_LIMITED':
        return 'Too many analyses started. Wait a minute and try again.';
      case 'NETWORK_ERROR':
        return 'Couldn’t reach the API. Is the backend running?';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// presentation helpers
// ---------------------------------------------------------------------------

const chipClasses =
  'rounded-full border border-[var(--color-border)] bg-transparent px-2.5 py-1 font-mono text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-foreground)] hover:text-[var(--color-foreground)]';

function SuggestionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[var(--color-muted-foreground)] sm:w-auto">
        {label}:
      </span>
      {children}
    </div>
  );
}

function startStageTicker(set: (msg: string) => void): { stop: () => void } {
  let i = 1;
  const t = setInterval(() => {
    set(STAGE_MESSAGES[i % STAGE_MESSAGES.length]!);
    i++;
  }, 4_000);
  return { stop: () => clearInterval(t) };
}
