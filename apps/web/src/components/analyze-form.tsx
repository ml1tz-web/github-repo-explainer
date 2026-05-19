'use client';

// Landing-page form. Validates with the shared zod schema, posts to the API,
// navigates to /analyze/[id] on success. Maps API error codes to friendly
// messages so the user sees "Repository not found" instead of an HTTP code.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { githubUrlSchema } from '@repo/shared';
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

export function AnalyzeForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [state, setState] = useState<FormState>({ status: 'idle' });

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

function startStageTicker(set: (msg: string) => void): { stop: () => void } {
  let i = 1;
  const t = setInterval(() => {
    set(STAGE_MESSAGES[i % STAGE_MESSAGES.length]!);
    i++;
  }, 4_000);
  return { stop: () => clearInterval(t) };
}
