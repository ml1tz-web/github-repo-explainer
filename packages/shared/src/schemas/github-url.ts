import { z } from 'zod';

// Accept the common shapes a user might paste:
//   https://github.com/owner/repo
//   https://github.com/owner/repo.git
//   https://github.com/owner/repo/tree/branch
//   github.com/owner/repo
// Reject SSH (git@github.com:...) for the MVP — public HTTPS only.

const GITHUB_HOST = 'github.com';

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  /** Normalized canonical form: https://github.com/owner/repo */
  normalized: string;
}

export const githubUrlSchema = z
  .string()
  .trim()
  .min(1, 'Repository URL is required')
  .max(2048, 'URL is too long')
  .transform((raw, ctx): ParsedGithubUrl => {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Not a valid URL' });
      return z.NEVER;
    }

    if (url.hostname.toLowerCase() !== GITHUB_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only github.com URLs are supported',
      });
      return z.NEVER;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must point to a repository (e.g. github.com/owner/repo)',
      });
      return z.NEVER;
    }

    const owner = segments[0]!;
    const repo = segments[1]!.replace(/\.git$/i, '');

    // Owner/repo names: GitHub allows alphanumerics, hyphens, underscores, dots.
    const nameRe = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
    if (!nameRe.test(owner) || !nameRe.test(repo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid owner or repository name',
      });
      return z.NEVER;
    }

    return {
      owner,
      repo,
      normalized: `https://${GITHUB_HOST}/${owner}/${repo}`,
    };
  });

export type GithubUrlInput = z.input<typeof githubUrlSchema>;
