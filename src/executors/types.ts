export interface RunLookup {
  workflowFile: string;
  headSha?: string;
  branch?: string;
  event?: string;
}

export interface ExecutionResult {
  /** False when nothing was pushed or dispatched (e.g. cancelled, no-op). */
  triggered: boolean;
  summary: string;
  tag?: string;
  ref?: string;
  sha?: string;
  commitCreated?: boolean;
  /** How to find the workflow run this action started. */
  lookup?: RunLookup;
  /** Wall-clock moment the trigger fired, used to match the right run. */
  triggeredAt?: number;
}
