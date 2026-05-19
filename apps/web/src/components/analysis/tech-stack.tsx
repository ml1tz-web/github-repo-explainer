import type { DetectedTech, TechCategory } from '@repo/shared';
import { Badge } from '@/components/ui/badge';

// Display order for category groups. Anything not in this list goes last.
const CATEGORY_ORDER: TechCategory[] = [
  'language',
  'framework',
  'runtime',
  'database',
  'build',
  'test',
  'infra',
  'ci',
  'package-manager',
  'other',
];

const CATEGORY_LABEL: Record<TechCategory, string> = {
  language: 'Languages',
  framework: 'Frameworks',
  runtime: 'Runtimes',
  database: 'Databases',
  build: 'Build',
  test: 'Testing',
  infra: 'Infrastructure',
  ci: 'CI/CD',
  'package-manager': 'Package managers',
  other: 'Other',
};

export function TechStack({ items }: { items: DetectedTech[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No technologies were detected.
      </p>
    );
  }

  const grouped = groupByCategory(items);

  return (
    <div className="flex flex-col gap-4">
      {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
        <div key={category}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {CATEGORY_LABEL[category]}
          </div>
          <div className="flex flex-wrap gap-2">
            {grouped[category]!.map((t) => (
              <Badge
                key={`${category}:${t.name}`}
                variant="secondary"
                title={t.evidence ?? undefined}
              >
                <span>{t.name}</span>
                {t.version && (
                  <span className="text-[var(--color-muted-foreground)]">{t.version}</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByCategory(items: DetectedTech[]): Partial<Record<TechCategory, DetectedTech[]>> {
  const out: Partial<Record<TechCategory, DetectedTech[]>> = {};
  for (const t of items) {
    (out[t.category] ??= []).push(t);
  }
  return out;
}
