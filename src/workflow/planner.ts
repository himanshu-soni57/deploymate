import type { Workflow } from "../types/workflow";
import type { DeploymentPlan } from "../types/deployment";

export function getDeploymentPlan(workflow: Workflow): DeploymentPlan {
  const on = workflow.on;

  if (
    Array.isArray((on.push as any)?.tags) &&
    (on.push as any).tags.length > 0
  ) {
    return {
      strategy: "tag",
      workflowName: workflow.name,
      workflowFile: workflow.filename,
      tagPattern: (on.push as any).tags[0],
    };
  }

  if (
    Array.isArray((on.push as any)?.branches) &&
    (on.push as any).branches.length > 0
  ) {
    return {
      strategy: "branch",
      workflowName: workflow.name,
      workflowFile: workflow.filename,
      branch: (on.push as any).branches[0],
    };
  }

  if (Object.hasOwn(on, "workflow_dispatch")) {
    return {
      strategy: "manual",
      workflowName: workflow.name,
      workflowFile: workflow.filename,
    };
  }

  return {
    strategy: "unknown",
    workflowName: workflow.name,
    workflowFile: workflow.filename,
  };
}
