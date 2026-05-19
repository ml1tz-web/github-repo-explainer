// Typed error hierarchy.
//
// Services throw these. The error middleware (middleware/error-handler.ts) is
// the single place that translates them into HTTP responses. Anything that
// isn't an AppError is treated as an unexpected 500 — its message is logged
// but NOT returned to the client (avoids leaking internals).

export interface AppErrorOptions {
  /** Stable machine-readable code consumed by the frontend. */
  code: string;
  /** Safe, user-facing message. */
  message: string;
  /** HTTP status code. */
  status: number;
  /** Optional field-level issues (e.g. zod validation). */
  issues?: Array<{ path: string; message: string }>;
  /** Original error for logging — never serialized to the client. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: Array<{ path: string; message: string }>;
  override readonly cause?: unknown;

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = new.target.name;
    this.code = opts.code;
    this.status = opts.status;
    this.issues = opts.issues;
    this.cause = opts.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, issues?: AppErrorOptions['issues']) {
    super({ code: 'VALIDATION_ERROR', message, status: 400, issues });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super({ code: 'NOT_FOUND', message: `${resource} not found`, status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({ code: 'CONFLICT', message, status: 409 });
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: 'UPSTREAM_ERROR', message, status: 502, cause });
  }
}

// ---- analysis-pipeline-specific errors -------------------------------------

export class RepoNotFoundError extends AppError {
  constructor(repoUrl: string) {
    super({
      code: 'REPO_NOT_FOUND',
      message: `Repository not found or not accessible: ${repoUrl}`,
      status: 404,
    });
  }
}

export class RepoTooLargeError extends AppError {
  constructor(sizeBytes: number, maxBytes: number) {
    super({
      code: 'REPO_TOO_LARGE',
      message: `Repository exceeds size limit (${Math.round(sizeBytes / 1024 / 1024)}MB > ${Math.round(maxBytes / 1024 / 1024)}MB)`,
      status: 413,
    });
  }
}

export class CloneTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super({
      code: 'CLONE_TIMEOUT',
      message: `Repository clone exceeded ${timeoutMs}ms`,
      status: 504,
    });
  }
}

export class CloneFailedError extends AppError {
  constructor(reason: string, cause?: unknown) {
    super({ code: 'CLONE_FAILED', message: reason, status: 502, cause });
  }
}

export class AiSummarizationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: 'AI_SUMMARIZATION_FAILED', message, status: 502, cause });
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
