// JSON Schema for the `emit_analysis` tool that Claude must call to return
// the structured analysis. Mirrors `analysisResultSchema` in @repo/shared,
// minus fields the orchestrator owns (`version`, `tree`).
//
// Kept hand-written rather than derived from zod — the schema is part of the
// public prompt contract, so an accidental zod refactor shouldn't silently
// change what we ask the model for.

import type { Anthropic } from '@anthropic-ai/sdk';

export const EMIT_ANALYSIS_TOOL_NAME = 'emit_analysis';

export const emitAnalysisTool: Anthropic.Messages.Tool = {
  name: EMIT_ANALYSIS_TOOL_NAME,
  description:
    'Submit the final structured analysis of the repository. Call this exactly once with your complete findings. Do not produce any text outside of this tool call.',
  input_schema: {
    type: 'object',
    required: [
      'summary',
      'purpose',
      'architecture',
      'setupInstructions',
      'technologies',
      'importantFiles',
    ],
    properties: {
      summary: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        description:
          'One- or two-sentence high-level description of what this repository is. No marketing language. Plain, factual.',
      },
      purpose: {
        type: 'string',
        minLength: 1,
        maxLength: 2000,
        description:
          'Beginner-friendly explanation of what problem the project solves and who would use it. 2-4 sentences. Avoid jargon when possible; define it when not.',
      },
      architecture: {
        type: 'string',
        minLength: 1,
        maxLength: 5000,
        description:
          'Markdown explanation of how the codebase is organized. Mention the major directories and how they relate. Identify obvious patterns (monorepo, MVC, layered, etc.) only if the file structure clearly supports them. Do not invent structure that is not visible in the provided files.',
      },
      setupInstructions: {
        type: 'string',
        minLength: 1,
        maxLength: 5000,
        description:
          'Markdown step-by-step instructions to run the project locally. Derive ONLY from the README, manifest files, Dockerfile, and visible scripts. If setup steps are not clear from the files, say so explicitly rather than guessing.',
      },
      technologies: {
        type: 'array',
        maxItems: 60,
        description:
          'Technologies actually used in this repo, detected from the provided files. Each must have direct evidence — a manifest entry, import, or config file.',
        items: {
          type: 'object',
          required: ['name', 'category'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 60,
              description: 'Canonical name (e.g. "React", "PostgreSQL", "Tailwind CSS").',
            },
            category: {
              type: 'string',
              enum: [
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
              ],
            },
            version: {
              type: 'string',
              maxLength: 40,
              description: 'Version string from a manifest, if available.',
            },
            evidence: {
              type: 'string',
              maxLength: 200,
              description:
                'One-line citation of where this was detected (e.g. "package.json devDependencies").',
            },
          },
        },
      },
      importantFiles: {
        type: 'array',
        maxItems: 40,
        description:
          'The handful of files a new contributor should read first. Sort by importance descending.',
        items: {
          type: 'object',
          required: ['path', 'purpose'],
          properties: {
            path: {
              type: 'string',
              minLength: 1,
              maxLength: 512,
              description: 'Repo-relative path, POSIX form, exactly as provided in the file list.',
            },
            purpose: {
              type: 'string',
              minLength: 1,
              maxLength: 400,
              description: 'One-sentence explanation of why this file matters.',
            },
          },
        },
      },
    },
  },
};
