import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { AnalysisDto } from '@repo/shared';
import { analysisResultSchema } from '@repo/shared';

import { env } from '@/config/env';
import { AnalysisResult } from '@/components/analysis/analysis-result';
import { SiteHeader } from '@/components/site-header';

// Server component. Fetches the analysis by id on the server side.
// Uses API_URL when set (docker-compose internal hostname), else falls back
// to NEXT_PUBLIC_API_URL (works for host-mode dev).

export const dynamic = 'force-dynamic'; // analyses are immutable but freshly fetched is fine for MVP

interface PageProps {
  params: Promise<{ id: string }>; // Next 15: async params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Analysis · ${id.slice(0, 12)}` };
}

export default async function AnalyzePage({ params }: PageProps) {
  const { id } = await params;
  const analysis = await fetchAnalysis(id);
  if (!analysis) notFound();

  // Validate the result payload before handing to the renderer. The DB row
  // could in principle be from an older schema version; reject anything that
  // doesn't match the current shape so the UI never crashes on shape drift.
  if (analysis.result) {
    const parsed = analysisResultSchema.safeParse(analysis.result);
    if (!parsed.success) {
      throw new Error('Analysis result has an unexpected shape (schema mismatch).');
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <AnalysisResult analysis={analysis} />
      </main>
    </div>
  );
}

async function fetchAnalysis(id: string): Promise<AnalysisDto | null> {
  const baseUrl = env.API_URL ?? env.NEXT_PUBLIC_API_URL;
  const url = `${baseUrl}/api/v1/analyses/${encodeURIComponent(id)}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    // Network failure (API down). Treat as a 5xx so error.tsx renders.
    throw new Error('Could not reach the API.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API returned ${res.status} when fetching analysis ${id}`);
  }

  const body = (await res.json()) as { analysis: AnalysisDto };
  return body.analysis;
}
