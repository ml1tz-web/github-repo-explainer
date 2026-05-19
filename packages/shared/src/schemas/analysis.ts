import { z } from 'zod';

// ---------------------------------------------------------------------------
// AnalysisResult — the structured AI output we persist in Analysis.result.
//
// The API validates against this schema *before* writing to the DB, and the
// frontend re-validates on read. This makes the JSON column safe to consume
// without manual casting and gives us a single migration point if the shape
// changes (bump a version field + write a transformer).
// ---------------------------------------------------------------------------

export const ANALYSIS_RESULT_VERSION = 1;

export const techCategorySchema = z.enum([
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
]);
export type TechCategory = z.infer<typeof techCategorySchema>;

export const detectedTechSchema = z.object({
  name: z.string().min(1).max(60),
  category: techCategorySchema,
  /** Optional version string extracted from manifests (e.g. "20.11.0"). */
  version: z.string().max(40).optional(),
  /** One-line rationale for why this was detected. */
  evidence: z.string().max(200).optional(),
});
export type DetectedTech = z.infer<typeof detectedTechSchema>;

export const importantFileSchema = z.object({
  path: z.string().min(1).max(512),
  purpose: z.string().min(1).max(400),
});
export type ImportantFile = z.infer<typeof importantFileSchema>;

export const fileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'directory']),
    sizeBytes: z.number().int().nonnegative().optional(),
    children: z.array(fileTreeNodeSchema).optional(),
  }),
);
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  children?: FileTreeNode[];
}

export const analysisResultSchema = z.object({
  version: z.literal(ANALYSIS_RESULT_VERSION),
  summary: z.string().min(1).max(1000),
  purpose: z.string().min(1).max(2000),
  architecture: z.string().min(1).max(5000),
  setupInstructions: z.string().min(1).max(5000),
  technologies: z.array(detectedTechSchema).max(60),
  importantFiles: z.array(importantFileSchema).max(40),
  tree: fileTreeNodeSchema,
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
