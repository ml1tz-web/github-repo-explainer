import { z } from 'zod';
import { githubUrlSchema } from '@repo/shared';

// The body schema for POST /api/v1/analyses. `url` is transformed by
// githubUrlSchema into a ParsedGithubUrl ({ owner, repo, normalized }),
// so the controller receives the parsed form, not the raw string.
export const createAnalysisBodySchema = z.object({
  url: githubUrlSchema,
});

export type CreateAnalysisBody = z.infer<typeof createAnalysisBodySchema>;

// Path params for GET /api/v1/analyses/:id. cuid() = Prisma default ID format.
export const analysisIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    // cuid() is alphanumeric, starts with 'c'. Cheap pre-DB sanity check.
    .regex(/^c[a-z0-9]+$/i, 'Invalid analysis id'),
});
