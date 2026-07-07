import { cancel, isCancel, select } from "@clack/prompts";
import type { Workflow } from "../types/workflow";

export async function selectWorkflow(workflows: Workflow[]): Promise<Workflow> {
  const result = await select({
    message: "Select a workflow",
    options: workflows.map((workflow) => ({
      value: workflow,
      label: workflow.name,
      hint: workflow.filename,
    })),
  });

  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  return result;
}
