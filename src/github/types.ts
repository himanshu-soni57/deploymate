export type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending";

export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

export interface WorkflowRun {
  id: number;
  name: string | null;
  display_title: string;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: RunStatus;
  conclusion: RunConclusion;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  actor?: { login: string };
  path?: string;
}

export interface JobStep {
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  number: number;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: JobStep[];
}

export interface RepoWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface Environment {
  id: number;
  name: string;
  protection_rules?: { type: string; reviewers?: unknown[] }[];
}

export interface Deployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  created_at: string;
  creator?: { login: string };
}

export interface DeploymentStatus {
  state: string;
  created_at: string;
  environment_url?: string;
}

export interface Release {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  created_at: string;
}
