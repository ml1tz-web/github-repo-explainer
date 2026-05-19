// Stage 4 of the analysis pipeline: call Claude with the curated repo data
// and get back a structured analysis.
//
// Structured-output strategy:
//   - Define a single tool `emit_analysis` whose input_schema mirrors the
//     `AnalysisResult` zod schema (sans `version` and `tree`).
//   - Force the model to call it via `tool_choice: { type: 'tool', ... }`.
//   - Validate the tool input with zod before returning.
//
// Caching:
//   - The system prompt carries `cache_control: ephemeral`. Repeated runs
//     against similar repos hit the cache for the system portion. The user
//     turn varies per repo so we don't cache it.

import Anthropic from '@anthropic-ai/sdk';
import { type z } from 'zod';
import { analysisResultSchema, type FileTreeNode } from '@repo/shared';

import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { AiSummarizationError, UpstreamError } from '../../utils/errors.js';
import { SYSTEM_PROMPT } from '../../prompts/system.js';
import { EMIT_ANALYSIS_TOOL_NAME, emitAnalysisTool } from '../../prompts/emit-analysis-tool.js';
import { buildUserPrompt } from '../../prompts/user.js';
import type { SelectedFile, SelectStats } from './file-selector.service.js';
import type { ScanStats } from './repo-scanner.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What Claude emits. Same shape as AnalysisResult minus the fields the
 * orchestrator owns (`version`, `tree`). Derived from the shared schema so
 * any field rename propagates here automatically.
 */
const aiPartialSchema = analysisResultSchema.omit({ version: true, tree: true });
export type AiPartial = z.infer<typeof aiPartialSchema>;

export interface SummarizeInput {
  repoUrl: string;
  defaultBranch: string;
  commitSha: string;
  tree: FileTreeNode;
  files: SelectedFile[];
  scanStats: ScanStats;
  selectStats: SelectStats;
  signal?: AbortSignal;
}

export interface SummarizeOutput {
  partial: AiPartial;
  tokensInput: number;
  tokensOutput: number;
}

// ---------------------------------------------------------------------------
// Client (lazy singleton — easy to mock in tests by clearing the cache)
// ---------------------------------------------------------------------------

let _client: Anthropic | undefined;
export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const log = logger.child({ service: 'ai-summarizer' });

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function summarizeRepo(input: SummarizeInput): Promise<SummarizeOutput> {
  const userPrompt = buildUserPrompt({
    repoUrl: input.repoUrl,
    defaultBranch: input.defaultBranch,
    commitSha: input.commitSha,
    tree: input.tree,
    files: input.files,
    scanStats: input.scanStats,
    selectStats: input.selectStats,
  });

  const client = getAnthropicClient();

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: 8192,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // Cache the system prompt across calls. Saves significant cost
            // on retries and reduces TTFB on cache hits.
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [emitAnalysisTool],
        tool_choice: { type: 'tool', name: EMIT_ANALYSIS_TOOL_NAME },
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: input.signal },
    );
  } catch (err) {
    throw mapAnthropicError(err);
  }

  const toolUse = extractToolUse(response);
  const partial = validateToolInput(toolUse.input);

  const tokensInput = response.usage.input_tokens;
  const tokensOutput = response.usage.output_tokens;

  log.info(
    {
      tokensInput,
      tokensOutput,
      cacheCreate: response.usage.cache_creation_input_tokens,
      cacheRead: response.usage.cache_read_input_tokens,
      stopReason: response.stop_reason,
    },
    'summarization complete',
  );

  return { partial, tokensInput, tokensOutput };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function extractToolUse(
  response: Anthropic.Messages.Message,
): Anthropic.Messages.ToolUseBlock {
  const block = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === 'tool_use' && b.name === EMIT_ANALYSIS_TOOL_NAME,
  );
  if (!block) {
    throw new AiSummarizationError(
      `Model did not call ${EMIT_ANALYSIS_TOOL_NAME}. stop_reason=${response.stop_reason}`,
    );
  }
  return block;
}

function validateToolInput(raw: unknown): AiPartial {
  const parsed = aiPartialSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new AiSummarizationError(`Model output failed validation: ${issues}`);
  }
  return parsed.data;
}

function mapAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    // 4xx → our request was bad (config/prompt). 5xx → upstream issue.
    if (err.status && err.status >= 400 && err.status < 500) {
      return new AiSummarizationError(`Anthropic ${err.status}: ${err.message}`, err);
    }
    return new UpstreamError(`Anthropic ${err.status ?? '?'}: ${err.message}`, err);
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new UpstreamError('AI summarization was aborted', err);
  }
  return new AiSummarizationError(
    err instanceof Error ? err.message : 'Unknown summarization error',
    err,
  );
}
