import Link from 'next/link';
import { ArrowLeft, ExternalLink, GitBranch, GitCommit } from 'lucide-react';
import type { AnalysisDto } from '@repo/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Markdown } from './markdown';
import { TechStack } from './tech-stack';
import { ImportantFiles } from './important-files';
import { FileTree } from './file-tree';

// Renders the full analysis. Top-level layout decisions:
//   - Hero with repo identity + meta
//   - 2-col grid for Summary | Tech (collapses to 1-col on small screens)
//   - Full-width Architecture and Setup (markdown, longest sections)
//   - 2-col grid for Important files | File tree
export function AnalysisResult({ analysis }: { analysis: AnalysisDto }) {
  const r = analysis.result;
  if (!r) {
    // Shouldn't reach here — caller has already validated. Defensive bail.
    return null;
  }

  const githubUrl = analysis.repoUrl;

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="size-3.5" />
          Analyze another repo
        </Link>

        <h1 className="flex flex-wrap items-baseline gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="text-[var(--color-muted-foreground)]">
            {analysis.repoOwner}/
          </span>
          <span>{analysis.repoName}</span>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-1 inline-flex items-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            aria-label="Open on GitHub"
          >
            <ExternalLink className="size-4" />
          </a>
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {analysis.defaultBranch && (
            <Badge variant="outline">
              <GitBranch className="size-3" />
              {analysis.defaultBranch}
            </Badge>
          )}
          <Badge variant="outline" title={analysis.commitSha}>
            <GitCommit className="size-3" />
            <span className="font-mono">{analysis.commitSha.slice(0, 7)}</span>
          </Badge>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            analyzed {timeAgo(analysis.createdAt)}
          </span>
        </div>

        <p className="text-base text-[var(--color-foreground)] sm:text-lg">{r.summary}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What is this?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-[var(--color-foreground)]">
              {r.purpose}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tech stack</CardTitle>
          </CardHeader>
          <CardContent>
            <TechStack items={r.technologies} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown>{r.architecture}</Markdown>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup &amp; run</CardTitle>
        </CardHeader>
        <CardContent>
          <Markdown>{r.setupInstructions}</Markdown>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Important files</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportantFiles items={r.importantFiles} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File tree</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <FileTree root={r.tree} />
            </div>
          </CardContent>
        </Card>
      </div>
    </article>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
