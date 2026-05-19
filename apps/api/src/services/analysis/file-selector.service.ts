// Stage 3 of the analysis pipeline: pick the most informative subset of
// scanned files, read their contents, and fit them under a token budget.
//
// Two phases:
//   1. Score every ScannedFile (0..1000) by a priority ruleset.
//   2. Greedy fill: always include README + root manifest; then walk the
//      remaining candidates in score order until the budget is spent.
//
// Token counts use a chars/4 estimator. Cheap, monotonic, good enough for
// budgeting. Claude's tokenizer is the source of truth at request time —
// any small overshoot is absorbed by the conservative default budget.

import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { ScannedFile } from './repo-scanner.service.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Priority rules (exported for testing/tuning)
// ---------------------------------------------------------------------------

/** Manifest files we want to see at the repo root. Lowercase keys. */
export const ROOT_MANIFESTS: ReadonlySet<string> = new Set([
  'package.json',
  'composer.json',
  'pyproject.toml',
  'requirements.txt',
  'pipfile',
  'setup.py',
  'setup.cfg',
  'go.mod',
  'cargo.toml',
  'gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'mix.exs',
  'rebar.config',
  'pubspec.yaml',
  'deno.json',
  'deno.jsonc',
  'bun.lockb', // kept as a signal even though it's a lockfile — bun.lockb is binary, scanner skips it anyway
]);

/** Infra files we always want, regardless of depth (most live at root). */
export const INFRA_FILES: ReadonlySet<string> = new Set([
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'makefile',
  'justfile',
  'taskfile.yml',
  'taskfile.yaml',
  'procfile',
  'fly.toml',
  'vercel.json',
  'netlify.toml',
  'render.yaml',
]);

/** Build/runtime configs — matched by filename, regardless of directory (within reason). */
const BUILD_CONFIG_RE =
  /^(tsconfig(\..+)?\.json|jsconfig\.json|vite\.config\.[mc]?[jt]s|next\.config\.[mc]?[jt]s|webpack\.config\.[mc]?[jt]s|rollup\.config\.[mc]?[jt]s|esbuild\.config\.[mc]?[jt]s|tailwind\.config\.[mc]?[jt]s|postcss\.config\.[mc]?[jt]s|babel\.config\.[mc]?[jt]s|\.babelrc(\..+)?|\.eslintrc(\..+)?|eslint\.config\.[mc]?[jt]s|\.prettierrc(\..+)?|jest\.config\.[mc]?[jt]s|vitest\.config\.[mc]?[jt]s|playwright\.config\.[mc]?[jt]s|nuxt\.config\.[mc]?[jt]s|svelte\.config\.[mc]?[jt]s|astro\.config\.[mc]?[jt]s|remix\.config\.[mc]?[jt]s|turbo\.json|nx\.json|pnpm-workspace\.yaml|lerna\.json)$/i;

/** Entry-point heuristics. Matched against full repo-relative path. */
const ENTRY_POINT_RE =
  /^(src\/(index|main|server|app)\.[mc]?[jt]sx?|app\/(index|main|page)\.[mc]?[jt]sx?|main\.(py|go|rs|kt|swift|c|cpp)|app\.py|server\.[mc]?[jt]sx?|cmd\/[^/]+\/main\.go|Program\.cs|Main\.java)$/i;

/** Schema/contract files. */
const SCHEMA_RE = /\.(prisma|proto|graphql|gql)$/i;

const OPENAPI_RE = /(^|\/)(openapi|swagger)(\.[^/]+)?\.(ya?ml|json)$/i;

/** Source code extensions we'll consider for the lower-priority tier. */
export const SOURCE_EXTS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala',
  'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'cs', 'fs',
  'php', 'swift', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish',
  'sql', 'graphql', 'gql',
  'css', 'scss', 'sass', 'less',
  'html', 'vue', 'svelte', 'astro',
  'lua', 'r', 'jl', 'dart', 'ex', 'exs', 'erl', 'clj', 'cljs',
  'yml', 'yaml', 'toml', 'json',
]);

const TEST_RE = /(^|\/)(__tests?__|tests?|spec|e2e)(\/|$)|\.(test|spec)\.[a-z]+$/i;
const GENERATED_RE = /(^|\/)(generated|__generated__|gen)(\/|$)|\.gen\.[a-z]+$/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SelectedFile {
  path: string;
  sizeBytes: number;
  ext: string;
  /** UTF-8 contents, possibly truncated. */
  contents: string;
  /** True if contents was cut to fit perFileMaxChars. */
  truncated: boolean;
  /** Score that earned it a spot. Surfaced for diagnostics/AI prompt. */
  priority: number;
}

export interface SelectStats {
  filesConsidered: number;
  filesSelected: number;
  tokensEstimate: number;
  budgetHit: boolean;
}

export interface SelectOptions {
  /** Total token budget for selected file contents. Default 40,000. */
  maxTokens?: number;
  /** Per-file character cap before truncation. Default 12,288 (~3k tokens). */
  perFileMaxChars?: number;
  /**
   * Higher cap for must-include files (README, root manifest). Default 32,768
   * (~8k tokens). Even if a README is bigger than this, we include the head.
   */
  mustIncludeMaxChars?: number;
}

export async function selectFiles(
  rootDir: string,
  files: ScannedFile[],
  opts: SelectOptions = {},
): Promise<{ selected: SelectedFile[]; stats: SelectStats }> {
  const maxTokens = opts.maxTokens ?? 40_000;
  const perFileMaxChars = opts.perFileMaxChars ?? 12 * 1024;
  const mustIncludeMaxChars = opts.mustIncludeMaxChars ?? 32 * 1024;

  const scored = files
    .map((f) => ({ file: f, priority: scoreFile(f) }))
    .filter((s) => s.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.file.path.localeCompare(b.file.path));

  const selected: SelectedFile[] = [];
  const seen = new Set<string>();
  let tokens = 0;
  let budgetHit = false;

  // ---- phase 1: must-include set ------------------------------------------
  const mustHaves = scored
    .filter((s) => s.priority >= 900)
    .slice(0, 6); // hard cap so we never blow the entire budget on manifests

  for (const { file, priority } of mustHaves) {
    const sel = await readSelectedFile(rootDir, file, priority, mustIncludeMaxChars);
    if (!sel) continue;
    selected.push(sel);
    seen.add(file.path);
    tokens += estimateTokens(sel.contents);
  }

  // ---- phase 2: greedy budgeted fill --------------------------------------
  for (const { file, priority } of scored) {
    if (seen.has(file.path)) continue;
    if (tokens >= maxTokens) {
      budgetHit = true;
      break;
    }

    const sel = await readSelectedFile(rootDir, file, priority, perFileMaxChars);
    if (!sel) continue;

    const cost = estimateTokens(sel.contents);
    if (tokens + cost > maxTokens) {
      // Try smaller candidates rather than giving up — file list is sorted by
      // priority not size, so a 300-byte config two slots later still fits.
      budgetHit = true;
      continue;
    }
    selected.push(sel);
    seen.add(file.path);
    tokens += cost;
  }

  return {
    selected,
    stats: {
      filesConsidered: scored.length,
      filesSelected: selected.length,
      tokensEstimate: tokens,
      budgetHit,
    },
  };
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

/** 0 = skip; higher = more informative. Pure function — testable in isolation. */
export function scoreFile(file: ScannedFile): number {
  const path = file.path;
  const name = posix.basename(path).toLowerCase();
  const depth = path.split('/').length - 1;

  // README — anywhere, but root is highest
  if (/^readme(\.|$)/i.test(name)) return depth === 0 ? 1000 : 800;

  // Root manifests
  if (depth === 0 && ROOT_MANIFESTS.has(name)) return 900;

  // Schema/contract files
  if (SCHEMA_RE.test(path) || OPENAPI_RE.test(path)) return 850;

  // Infra
  if (INFRA_FILES.has(name)) return depth === 0 ? 820 : 760;
  if (/^\.github\/workflows\//.test(path)) return 740;

  // Build configs
  if (depth <= 2 && BUILD_CONFIG_RE.test(name)) return 700;

  // Env example
  if (/^\.env\.(example|sample|template|dist)$/i.test(name)) return 650;

  // Entry points
  if (ENTRY_POINT_RE.test(path)) return 600;

  // Docs
  if (depth === 0 && /^(contributing|architecture|changelog|security)\.md$/i.test(name)) {
    return 520;
  }
  if (path.toLowerCase().startsWith('docs/') && name.endsWith('.md')) return 500;

  // Regular source
  if (SOURCE_EXTS.has(file.ext)) {
    if (TEST_RE.test(path)) return 180;
    if (GENERATED_RE.test(path)) return 80;
    const depthPenalty = Math.min(depth * 25, 250);
    const sizeBonus = file.sizeBytes < 4096 ? 40 : 0;
    return Math.max(50, 420 - depthPenalty + sizeBonus);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

async function readSelectedFile(
  rootDir: string,
  file: ScannedFile,
  priority: number,
  maxChars: number,
): Promise<SelectedFile | null> {
  // file.path is POSIX-relative; join with the absolute root for fs ops.
  const abs = join(rootDir, ...file.path.split('/'));
  let raw: string;
  try {
    raw = await readFile(abs, 'utf8');
  } catch (err) {
    logger.warn({ err, path: file.path }, 'file-selector: failed to read file');
    return null;
  }

  let contents = raw;
  let truncated = false;
  if (contents.length > maxChars) {
    contents =
      contents.slice(0, maxChars) +
      `\n\n[... truncated: ${raw.length - maxChars} bytes omitted of ${raw.length} total ...]\n`;
    truncated = true;
  }

  return { path: file.path, sizeBytes: file.sizeBytes, ext: file.ext, contents, truncated, priority };
}

/** chars/4 is the standard heuristic for Claude/GPT-class tokenizers. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
