export interface ErrorOptions {
  hint?: string;
  /** Process exit code. 1 = failure, 130 = user cancelled. */
  exitCode?: number;
  cause?: unknown;
}

export class DeployPilotError extends Error {
  readonly hint?: string;
  readonly exitCode: number;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = "DeployPilotError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Thrown when the user aborts a prompt. Exits 130, the SIGINT convention. */
export class CancelledError extends DeployPilotError {
  constructor(message = "Operation cancelled.") {
    super(message, { exitCode: 130 });
    this.name = "CancelledError";
  }
}
