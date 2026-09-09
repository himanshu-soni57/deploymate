export type StrategyKind = "tag" | "branch" | "dispatch" | "release";

export interface TagStrategy {
  kind: "tag";
  patterns: string[];
  ignore: string[];
}

export interface BranchStrategy {
  kind: "branch";
  branches: string[];
  ignore: string[];
  paths: string[];
  pathsIgnore: string[];
}

export interface DispatchStrategy {
  kind: "dispatch";
  inputs: Record<string, import("./workflow").WorkflowInput>;
}

export interface ReleaseStrategy {
  kind: "release";
  types: string[];
}

export type Strategy =
  | TagStrategy
  | BranchStrategy
  | DispatchStrategy
  | ReleaseStrategy;

export interface StrategyCandidate {
  strategy: Strategy;
  /** Human label for the picker. */
  label: string;
  hint: string;
  /** Higher wins when auto-selecting. */
  rank: number;
}

export interface DeploymentPlan {
  workflowName: string;
  workflowFile: string;
  candidates: StrategyCandidate[];
  /** Reasons the workflow cannot be triggered by this tool. */
  blockers: string[];
}
