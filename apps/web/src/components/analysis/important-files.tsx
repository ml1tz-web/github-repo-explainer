import { FileCode } from 'lucide-react';
import type { ImportantFile } from '@repo/shared';

export function ImportantFiles({ items }: { items: ImportantFile[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No specific files were highlighted.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((f) => (
        <li key={f.path} className="flex items-start gap-3">
          <FileCode className="mt-0.5 size-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <div className="min-w-0 flex-1">
            <div className="break-all font-mono text-xs text-[var(--color-foreground)]">
              {f.path}
            </div>
            <div className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
              {f.purpose}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
