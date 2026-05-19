import { Github, GitBranch, Layers, Wrench } from 'lucide-react';
import { AnalyzeForm } from '@/components/analyze-form';
import { ThemeToggle } from '@/components/theme-toggle';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2 font-mono text-sm">
          <Github className="size-5" />
          <span className="font-semibold">repo-explainer</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
        <div className="space-y-4 text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Understand any GitHub repo in seconds.
          </h1>
          <p className="mx-auto max-w-xl text-balance text-[var(--color-muted-foreground)]">
            Paste a public repository URL. We&apos;ll explain the architecture, detect the
            tech stack, and walk you through how to run it locally.
          </p>
        </div>

        <AnalyzeForm />

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Layers className="size-5" />}
            title="Architecture"
            body="High-level breakdown of how the codebase is organized and why."
          />
          <FeatureCard
            icon={<GitBranch className="size-5" />}
            title="Tech stack"
            body="Detects languages, frameworks, databases, and tooling from manifests."
          />
          <FeatureCard
            icon={<Wrench className="size-5" />}
            title="Setup"
            body="Generates clear, runnable instructions to get the project on your machine."
          />
        </div>
      </main>

      <footer className="border-t border-[var(--color-border)] px-6 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
        Public repositories only · Analyses are cached by commit SHA
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-foreground)]">
        {icon}
      </div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="text-sm text-[var(--color-muted-foreground)]">{body}</p>
    </div>
  );
}
