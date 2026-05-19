// Stage 1 of the analysis pipeline: clone a public GitHub repository into a
// temp directory and return its HEAD SHA + on-disk size.
//
// Design notes:
//   - Spawned, not shelled. No injection surface — all arguments are passed
//     to git as separate argv entries.
//   - Caller owns cleanup() so the temp dir survives across later pipeline
//     stages (scan, file-read). The orchestrator runs cleanup in a finally
//     so it executes even when downstream stages throw.
//   - Size cap is enforced *after* clone. GitHub does not expose repo size
//     without authentication, and we want this service to be auth-free.
//     The clone is bounded by CLONE_TIMEOUT_MS in the meantime.
//   - We never trust paths derived from input — every fs operation joins
//     against the unique tempRoot we created.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  CloneFailedError,
  CloneTimeoutError,
  RepoNotFoundError,
  RepoTooLargeError,
} from '../../utils/errors.js';

export interface CloneInput {
  /** Normalized https://github.com/owner/repo URL (from githubUrlSchema). */
  repoUrl: string;
  /** External abort signal — caller can cancel mid-clone. */
  signal?: AbortSignal;
}

export interface CloneResult {
  /** Absolute path to the working tree. */
  dir: string;
  /** Full 40-char commit SHA at HEAD. */
  commitSha: string;
  /** Total bytes occupied by the working tree (excluding .git). */
  sizeBytes: number;
  /** Default branch name as reported by git. */
  defaultBranch: string;
  /** Idempotent cleanup. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

const log = logger.child({ service: 'git-clone' });

/**
 * Resolve the HEAD commit SHA of a remote without cloning. Used by the
 * orchestrator for the cache lookup — a cache hit avoids the clone entirely.
 *
 * Returns `null` if the remote rejects the listing (private / nonexistent
 * repo) — caller treats this as REPO_NOT_FOUND so we surface a 404 with the
 * same code path as a failing clone.
 */
export async function resolveHeadSha(
  repoUrl: string,
  signal?: AbortSignal,
): Promise<{ sha: string; defaultBranch: string } | null> {
  try {
    // `git ls-remote --symref <url> HEAD` outputs:
    //   ref: refs/heads/main\tHEAD
    //   <sha>\tHEAD
    const { stdout } = await execGit(
      ['ls-remote', '--symref', '--', repoUrl, 'HEAD'],
      undefined,
      signal,
    );
    const lines = stdout.split('\n');
    let defaultBranch = 'main';
    let sha: string | undefined;
    for (const line of lines) {
      const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line);
      if (symref) {
        defaultBranch = symref[1]!;
        continue;
      }
      const shaMatch = /^([0-9a-f]{40})\s+HEAD$/.exec(line);
      if (shaMatch) sha = shaMatch[1];
    }
    if (!sha) return null;
    return { sha, defaultBranch };
  } catch (err) {
    // RepoNotFoundError from classifier → treat as null so the caller can
    // decide. Anything else (timeout, missing git) → re-throw.
    if (err instanceof RepoNotFoundError) return null;
    throw err;
  }
}

export async function cloneRepo(input: CloneInput): Promise<CloneResult> {
  const tempRoot = await ensureCloneRoot();
  const workDir = await mkdtemp(join(tempRoot, 'clone-'));

  // cleanup() is closed over workDir and made idempotent so the orchestrator
  // can call it once unconditionally without bookkeeping.
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch (err) {
      log.warn({ err, workDir }, 'cleanup failed (non-fatal)');
    }
  };

  try {
    await runGitClone(input.repoUrl, workDir, input.signal);
    const commitSha = await runGitRevParse(workDir);
    const defaultBranch = await runGitDefaultBranch(workDir);
    const sizeBytes = await measureTreeSize(workDir);

    const maxBytes = env.CLONE_MAX_REPO_SIZE_MB * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      throw new RepoTooLargeError(sizeBytes, maxBytes);
    }

    return { dir: workDir, commitSha, sizeBytes, defaultBranch, cleanup };
  } catch (err) {
    // Anything thrown above means we own the temp dir — clean it ourselves
    // before re-throwing so a failing clone doesn't leak disk.
    await cleanup();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

let cloneRootPromise: Promise<string> | undefined;

/** Resolve and create CLONE_TMP_DIR once per process. */
async function ensureCloneRoot(): Promise<string> {
  if (!cloneRootPromise) {
    cloneRootPromise = (async () => {
      const root = resolve(env.CLONE_TMP_DIR || join(tmpdir(), 'repo-explainer'));
      await mkdir(root, { recursive: true });
      return root;
    })();
  }
  return cloneRootPromise;
}

async function runGitClone(
  repoUrl: string,
  workDir: string,
  externalSignal: AbortSignal | undefined,
): Promise<void> {
  const args = [
    'clone',
    '--depth=1',
    '--no-tags',
    '--single-branch',
    '--quiet',
    '--',
    repoUrl,
    workDir,
  ];
  const { stderr } = await execGit(args, undefined, externalSignal);

  // git is silent on success when --quiet is passed. If we got here without
  // throwing, the clone succeeded. stderr is used only for diagnostics in
  // the upstream classifier (already consumed inside execGit on failure).
  void stderr;
}

async function runGitRevParse(cwd: string): Promise<string> {
  const { stdout } = await execGit(['rev-parse', 'HEAD'], cwd);
  const sha = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new CloneFailedError(`Unexpected rev-parse output: "${sha}"`);
  }
  return sha;
}

async function runGitDefaultBranch(cwd: string): Promise<string> {
  // After a shallow single-branch clone, HEAD's branch is the default.
  const { stdout } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return stdout.trim() || 'main';
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Run a git subcommand. Combines the caller's signal with a per-process
 * timeout. Classifies common failure modes into typed AppErrors.
 */
async function execGit(
  args: string[],
  cwd?: string,
  externalSignal?: AbortSignal,
): Promise<ExecResult> {
  const timeoutMs = env.CLONE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  // If the caller aborts, propagate it.
  externalSignal?.addEventListener('abort', () => controller.abort(externalSignal.reason), {
    once: true,
  });

  return new Promise<ExecResult>((resolvePromise, rejectPromise) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // never prompt for credentials
        GIT_ASKPASS: 'echo',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
        rejectPromise(new CloneTimeoutError(timeoutMs));
        return;
      }
      if (err.code === 'ENOENT') {
        rejectPromise(
          new CloneFailedError('`git` executable not found on PATH', err),
        );
        return;
      }
      rejectPromise(new CloneFailedError(err.message, err));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        rejectPromise(new CloneTimeoutError(timeoutMs));
        return;
      }
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      rejectPromise(classifyGitError(stderr, code ?? -1));
    });
  });
}

function classifyGitError(stderr: string, exitCode: number): Error {
  const msg = stderr.toLowerCase();
  if (
    msg.includes('repository not found') ||
    msg.includes('could not read from remote repository') ||
    msg.includes('not found')
  ) {
    return new RepoNotFoundError('unknown');
  }
  if (msg.includes('authentication') || msg.includes('terminal prompts disabled')) {
    return new RepoNotFoundError('unknown'); // private repo → treat as not-found
  }
  return new CloneFailedError(
    `git exited with code ${exitCode}: ${stderr.trim().slice(0, 200)}`,
  );
}

/**
 * Sum file sizes under `dir`, skipping `.git`. We do this with a manual walk
 * (rather than shelling to `du`) for cross-platform behavior and so we can
 * short-circuit as soon as we exceed the cap.
 */
async function measureTreeSize(dir: string): Promise<number> {
  const maxBytes = env.CLONE_MAX_REPO_SIZE_MB * 1024 * 1024;
  let total = 0;

  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue; // never follow symlinks
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const st = await stat(full);
        total += st.size;
        if (total > maxBytes) return; // short-circuit; caller compares again
      }
    }
  };

  await walk(dir);
  return total;
}
