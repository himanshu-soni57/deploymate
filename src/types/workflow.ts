export interface WorkflowInput {
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  type?: "string" | "boolean" | "choice" | "environment" | "number";
  options?: string[];
}

export interface WorkflowDispatch {
  inputs?: Record<string, WorkflowInput>;
}

export interface PushTrigger {
  branches?: string[];
  "branches-ignore"?: string[];
  tags?: string[];
  "tags-ignore"?: string[];
  paths?: string[];
  "paths-ignore"?: string[];
}

export interface ReleaseTrigger {
  types?: string[];
}

export interface ScheduleTrigger {
  cron: string;
}

export interface WorkflowTrigger {
  push?: PushTrigger | null;
  pull_request?: PushTrigger | null;
  pull_request_target?: PushTrigger | null;
  workflow_dispatch?: WorkflowDispatch | null;
  workflow_call?: Record<string, unknown> | null;
  repository_dispatch?: { types?: string[] } | null;
  release?: ReleaseTrigger | null;
  schedule?: ScheduleTrigger[] | null;
  [event: string]: unknown;
}

export interface WorkflowJob {
  name?: string;
  "runs-on"?: string | string[];
  environment?: string | { name?: string; url?: string };
  needs?: string | string[];
  if?: string;
  steps?: WorkflowStep[];
  "timeout-minutes"?: number;
  permissions?: string | Record<string, string>;
  strategy?: Record<string, unknown>;
  uses?: string;
}

export interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  if?: string;
}

export interface WorkflowRaw {
  name?: string;
  on: WorkflowTrigger;
  jobs: Record<string, WorkflowJob>;
  permissions?: string | Record<string, string>;
  concurrency?: string | { group: string; "cancel-in-progress"?: boolean };
  env?: Record<string, unknown>;
}

export interface Workflow {
  /** Display name (falls back to the filename when `name:` is absent). */
  name: string;
  filename: string;
  path: string;
  on: WorkflowTrigger;
  jobs: Record<string, WorkflowJob>;
  raw: WorkflowRaw;
  /** Raw file text, kept for line-accurate lint diagnostics. */
  source: string;
}
