import type { DeploymentPlan } from "../types/deployment";
import type { Workflow } from "../types/workflow";

export function getDeploymentPlan(workflow: Workflow): DeploymentPlan {
  const { on } = workflow;

  if (on.push?.tags?.length) {
    return {
      strategy: "tag",
      workflowName: workflow.name,
      workflowFile: workflow.filename,
      tagPattern: on.push.tags[0],
    };
  }

  if (on.push?.branches?.length) {
    return {
      strategy: "branch",
      workflowName: workflow.name,
      workflowFile: workflow.filename,
      branch: on.push.branches[0],
    };
  }

  if ("workflow_dispatch" in on) {
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
