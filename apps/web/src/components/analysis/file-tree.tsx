'use client';

// Collapsible file tree. Directories at depth <= 1 open by default; deeper
// branches start collapsed. Files show their size; directories don't.
//
// Pure client component — no data fetching. Receives the full FileTreeNode
// from the server and renders it.

import { useState } from 'react';
import { ChevronRight, File as FileIcon, Folder, FolderOpen } from 'lucide-react';
import type { FileTreeNode } from '@repo/shared';
import { cn } from '@/lib/utils';

export function FileTree({ root }: { root: FileTreeNode }) {
  return (
    <div className="font-mono text-xs leading-relaxed">
      <TreeNode node={root} depth={0} />
    </div>
  );
}

function TreeNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth <= 1);

  if (node.type === 'file') {
    return (
      <div
        className="flex items-center gap-1.5 py-0.5"
        style={{ paddingLeft: depth * 14 }}
      >
        <FileIcon className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="truncate">{node.name}</span>
        {typeof node.sizeBytes === 'number' && (
          <span className="ml-auto pl-2 text-[var(--color-muted-foreground)]">
            {formatBytes(node.sizeBytes)}
          </span>
        )}
      </div>
    );
  }

  const children = node.children ?? [];
  const isRoot = depth === 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left hover:text-[var(--color-foreground)]"
        style={{ paddingLeft: depth * 14 }}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform text-[var(--color-muted-foreground)]',
            open && 'rotate-90',
          )}
        />
        {open ? (
          <FolderOpen className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        )}
        <span className={cn('truncate', isRoot && 'font-semibold')}>
          {node.name}/
        </span>
        <span className="ml-auto pl-2 text-[var(--color-muted-foreground)]">
          {children.length}
        </span>
      </button>
      {open && children.length > 0 && (
        <div>
          {children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
