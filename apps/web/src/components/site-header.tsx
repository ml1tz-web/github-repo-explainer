import Link from 'next/link';
import { Github } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Shared top bar. The home link doubles as the logo. `showThemeToggle`
 * defaults to true; loading/error/not-found pages hide it because they're
 * transient states where the toggle would feel out of place.
 */
export function SiteHeader({
  showThemeToggle = true,
}: {
  showThemeToggle?: boolean;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
      <Link
        href="/"
        className="flex items-center gap-2 font-mono text-sm transition-opacity hover:opacity-80"
        aria-label="Home"
      >
        <Github className="size-5" />
        <span className="font-semibold">repo-explainer</span>
      </Link>
      {showThemeToggle && <ThemeToggle />}
    </header>
  );
}
