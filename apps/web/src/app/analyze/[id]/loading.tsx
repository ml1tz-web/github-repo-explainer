import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="font-mono text-sm font-semibold">repo-explainer</div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-5 w-full max-w-xl" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </main>
    </div>
  );
}
