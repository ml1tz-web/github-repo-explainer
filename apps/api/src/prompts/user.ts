// Builds the per-repo user message.
//
// Structure (in order):
//   - Repo header (URL, branch, SHA)
//   - Scan stats (so the model knows how complete the picture is)
//   - File tree (ASCII, capped)
//   - Selected files with contents (in priority order)
//
// All token-bounded. The orchestrator decides budgets; this module just
// renders what it's given.

import type { FileTreeNode } from '@repo/shared';
import type { SelectedFile } from '../services/analysis/file-selector.service.js';
import type { ScanStats } from '../services/analysis/repo-scanner.service.js';
import type { SelectStats } from '../services/analysis/file-selector.service.js';

export interface BuildUserPromptInput {
  repoUrl: string;
  defaultBranch: string;
  commitSha: string;
  tree: FileTreeNode;
  files: SelectedFile[];
  scanStats: ScanStats;
  selectStats: SelectStats;
  /** Hard cap on ASCII tree characters. Default 6000. */
  maxTreeChars?: number;
}

export function buildUserPrompt(input: BuildUserPromptInput): string {
  const maxTreeChars = input.maxTreeChars ?? 6000;
  const treeAscii = renderTreeAscii(input.tree, maxTreeChars);
  const truncatedNote =
    input.scanStats.truncated || input.selectStats.budgetHit
      ? '\n> Note: this is a partial view. The scan or selection was truncated by safety caps.'
      : '';

  const filesBlock = input.files.map(renderFile).join('\n\n');

  return [
    `# Repository`,
    `- URL: ${input.repoUrl}`,
    `- Default branch: ${input.defaultBranch}`,
    `- Commit: ${input.commitSha}`,
    ``,
    `# Scan stats`,
    `- Files scanned: ${input.scanStats.filesScanned}`,
    `- Files skipped (ignored): ${input.scanStats.filesSkipped}`,
    `- Bytes scanned: ${input.scanStats.bytesScanned}`,
    `- Files selected for review: ${input.selectStats.filesSelected}`,
    `- Estimated input tokens: ${input.selectStats.tokensEstimate}`,
    truncatedNote,
    ``,
    `# File tree`,
    '```',
    treeAscii,
    '```',
    ``,
    `# Selected files`,
    `Sorted by priority. Contents may be truncated; truncation is marked inline.`,
    ``,
    filesBlock,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function renderFile(f: SelectedFile): string {
  const fence = pickFence(f.contents);
  const lang = languageHint(f.ext);
  const header = `## ${f.path}${f.truncated ? ' (truncated)' : ''}`;
  return `${header}\n${fence}${lang}\n${f.contents}\n${fence}`;
}

/** Choose a fence longer than any backtick run inside the file. */
function pickFence(contents: string): string {
  let n = 3;
  while (n < 7 && contents.includes('`'.repeat(n))) n++;
  return '`'.repeat(n);
}

/** Map known extensions to markdown fence language hints. */
function languageHint(ext: string): string {
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    c: 'c', cc: 'cpp', cpp: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', php: 'php', swift: 'swift',
    sh: 'bash', bash: 'bash',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    css: 'css', scss: 'scss', html: 'html', vue: 'vue', svelte: 'svelte',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', json: 'json',
    md: 'markdown', prisma: 'prisma', dockerfile: 'dockerfile',
  };
  return map[ext] ?? '';
}

/**
 * Render the file tree as ASCII. Returns the rendered string truncated to
 * `maxChars`, with a trailing notice if cut.
 */
function renderTreeAscii(root: FileTreeNode, maxChars: number): string {
  const out: string[] = [`${root.name}/`];
  let total = out[0]!.length;
  let truncated = false;

  const walk = (node: FileTreeNode, prefix: string): void => {
    if (truncated || !node.children) return;
    const children = node.children;
    children.forEach((child, i) => {
      if (truncated) return;
      const isLast = i === children.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      const line = prefix + connector + child.name + (child.type === 'directory' ? '/' : '');
      if (total + line.length + 1 > maxChars) {
        truncated = true;
        out.push(prefix + '└── … (tree truncated)');
        return;
      }
      out.push(line);
      total += line.length + 1;
      if (child.type === 'directory') walk(child, childPrefix);
    });
  };

  walk(root, '');
  return out.join('\n');
}
