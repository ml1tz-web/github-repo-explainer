'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

export default function AnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader showThemeToggle={false} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="size-10 text-[var(--color-destructive)]" />
        <h1 className="text-xl font-semibold">Couldn&apos;t load this analysis</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {error.message || 'Something went wrong.'}
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/" className={cn(buttonVariants({ variant: 'default' }))}>
            Start over
          </Link>
        </div>
      </main>
    </div>
  );
}
