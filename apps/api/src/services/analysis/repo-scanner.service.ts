// Stage 2 of the analysis pipeline: walk the cloned working tree and emit
//   (a) a FileTreeNode for the UI
//   (b) a flat ScannedFile[] for the file selector
// in a single pass.
//
// This service never reads file *contents* — only metadata. Content reads
// happen in stage 3 (file-selector.service.ts) for the small subset that
// actually goes to Claude.

import { readdir, stat } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import type { FileTreeNode } from '@repo/shared';

// ---------------------------------------------------------------------------
// Ignore rules — exported so they're testable and tunable in one place.
// ---------------------------------------------------------------------------

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'dist',
  'build',
  'out',
  'target', // rust, java
  'bin',
  'obj', // .NET
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'vendor', // go, php
  'bower_components',
  '.gradle',
  '.idea',
  '.vscode',
  '.DS_Store',
  'coverage',
  '.nyc_output',
  'tmp',
  'temp',
]);

export const IGNORED_FILE_EXTS: ReadonlySet<string> = new Set([
  // images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'tiff',
  // fonts
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  // archives
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  '7z',
  'rar',
  // documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  // media
  'mp3',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'wav',
  'flac',
  'webm',
  // binaries
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dat',
  'class',
  'jar',
  'war',
  'pyc',
  // misc
  'log',
  'tsbuildinfo',
  // sourcemaps are noisy and never instructive
  'map',
]);

/** Files we always skip by exact name (case-insensitive). */
export const IGNORED_FILENAMES: ReadonlySet<string> = new Set([
  '.ds_store',
  'thumbs.db',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  // Common lockfiles — verbose, rarely instructive for explanation purposes.
  // (We still report the manifest like package.json itself; just not the lock.)
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'gemfile.lock',
  'poetry.lock',
  'cargo.lock',
  'go.sum',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScannedFile {
  /** Path relative to the scan root, in POSIX form. */
  path: string;
  sizeBytes: number;
  /** Lowercase extension without the dot, or '' if none. */
  ext: string;
}

export interface ScanStats {
  filesScanned: number;
  filesSkipped: number;
  bytesScanned: number;
  /** True if maxFiles or maxDepth caps were hit and the result is partial. */
  truncated: boolean;
}

export interface ScanResult {
  tree: FileTreeNode;
  files: ScannedFile[];
  stats: ScanStats;
}

export interface ScanOptions {
  /** Max directory depth (root = 0). Default 10. */
  maxDepth?: number;
  /** Cap on files included in the result. Default 1500. */
  maxFiles?: number;
  /** Files larger than this are skipped (and counted as skipped). Default 512 KB. */
  maxFileSizeBytes?: number;
  /** Name to use for the tree root node. Defaults to the basename of rootDir. */
  rootName?: string;
}

export async function scanRepo(rootDir: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const maxDepth = opts.maxDepth ?? 10;
  const maxFiles = opts.maxFiles ?? 1500;
  const maxFileSizeBytes = opts.maxFileSizeBytes ?? 512 * 1024;
  const rootName = opts.rootName ?? basename(rootDir);

  const files: ScannedFile[] = [];
  const stats: ScanStats = {
    filesScanned: 0,
    filesSkipped: 0,
    bytesScanned: 0,
    truncated: false,
  };

  const root: FileTreeNode = {
    name: rootName,
    path: '',
    type: 'directory',
    children: [],
  };

  await walk(rootDir, '', 0, root, { rootDir, maxDepth, maxFiles, maxFileSizeBytes, files, stats });

  // Sort each directory's children: dirs first, then files, both alphabetical.
  // Stable, deterministic output makes UIs and snapshots reproducible.
  sortTreeInPlace(root);

  return { tree: root, files, stats };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface WalkContext {
  rootDir: string;
  maxDepth: number;
  maxFiles: number;
  maxFileSizeBytes: number;
  files: ScannedFile[];
  stats: ScanStats;
}

async function walk(
  absDir: string,
  relDir: string,
  depth: number,
  parentNode: FileTreeNode,
  ctx: WalkContext,
): Promise<void> {
  if (ctx.stats.truncated) return;

  if (depth >= ctx.maxDepth) {
    ctx.stats.truncated = true;
    return;
  }

  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    // Permission errors, races during cleanup, etc. — skip silently.
    return;
  }

  for (const entry of entries) {
    if (ctx.stats.truncated) return;

    // Never follow symlinks. Special files (sockets, fifos) are ignored too.
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;

    const nameLower = entry.name.toLowerCase();
    const absChild = join(absDir, entry.name);
    const relChild = relDir ? posix.join(relDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || IGNORED_DIRS.has(nameLower)) continue;
      const dirNode: FileTreeNode = {
        name: entry.name,
        path: relChild,
        type: 'directory',
        children: [],
      };
      parentNode.children!.push(dirNode);
      await walk(absChild, relChild, depth + 1, dirNode, ctx);
      // Prune empty dirs so the tree isn't full of skipped-into shells.
      if (dirNode.children!.length === 0) {
        parentNode.children!.pop();
      }
      continue;
    }

    // File
    if (IGNORED_FILENAMES.has(nameLower)) {
      ctx.stats.filesSkipped++;
      continue;
    }
    const ext = extOf(entry.name);
    if (ext && IGNORED_FILE_EXTS.has(ext)) {
      ctx.stats.filesSkipped++;
      continue;
    }

    let size: number;
    try {
      size = (await stat(absChild)).size;
    } catch {
      ctx.stats.filesSkipped++;
      continue;
    }

    if (size > ctx.maxFileSizeBytes) {
      ctx.stats.filesSkipped++;
      continue;
    }

    if (ctx.files.length >= ctx.maxFiles) {
      ctx.stats.truncated = true;
      return;
    }

    ctx.files.push({ path: relChild, sizeBytes: size, ext });
    ctx.stats.filesScanned++;
    ctx.stats.bytesScanned += size;

    parentNode.children!.push({
      name: entry.name,
      path: relChild,
      type: 'file',
      sizeBytes: size,
    });
  }
}

function extOf(filename: string): string {
  const e = extname(filename);
  return e ? e.slice(1).toLowerCase() : '';
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'root';
}

function sortTreeInPlace(node: FileTreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTreeInPlace(child);
}
