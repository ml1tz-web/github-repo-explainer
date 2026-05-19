import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader showThemeToggle={false} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <FileQuestion className="size-10 text-[var(--color-muted-foreground)]" />
        <h1 className="text-xl font-semibold">Analysis not found</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          This analysis ID doesn&apos;t exist. It may have been deleted, or the link is wrong.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: 'default' }), 'mt-2')}>
          Start a new analysis
        </Link>
      </main>
    </div>
  );
}
