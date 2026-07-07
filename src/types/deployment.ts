export type DeploymentStrategy = "manual" | "tag" | "branch" | "unknown";

export interface DeploymentPlan {
  strategy: DeploymentStrategy;

  workflowName: string;

  workflowFile: string;

  branch?: string;

  tagPattern?: string;
}
