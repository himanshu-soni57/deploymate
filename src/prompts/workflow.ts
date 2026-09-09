import { select } from "@clack/prompts";
import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import { buildPlan } from "../workflow/planner";
import type { Workflow } from "../types/workflow";

export async function selectWorkflow(
  workflows: Workflow[],
  interactive: boolean,
): Promise<Workflow> {
  const deployable = workflows.filter(
    (workflow) => buildPlan(workflow).candidates.length > 0,
  );

  const pool = deployable.length ? deployable : workflows;

  if (pool.length === 1) return pool[0]!;

  if (!interactive) {
    throw new DeployPilotError(
      `${pool.length} workflows found; cannot choose without a prompt.`,
      {
        hint:
          "Name one explicitly:\n" +
          pool.map((workflow) => `  --workflow ${workflow.filename}`).join("\n"),
      },
    );
  }

  const skipped = workflows.length - deployable.length;

  return unwrap(
    await select({
      message:
        skipped > 0
          ? `Select a workflow ${pc.dim(`(${skipped} not directly triggerable, hidden)`)}`
          : "Select a workflow",
      options: pool.map((workflow) => {
        const plan = buildPlan(workflow);
        return {
          value: workflow,
          label: workflow.name,
          hint: plan.candidates.length
            ? `${workflow.filename} - ${plan.candidates
                .map((candidate) => candidate.label.toLowerCase())
                .join(" / ")}`
            : `${workflow.filename} - not triggerable`,
        };
      }),
    }),
  );
}

export function findWorkflow(
  workflows: Workflow[],
  needle: string,
): Workflow {
  const lowered = needle.toLowerCase();

  const match =
    workflows.find((workflow) => workflow.filename === needle) ??
    workflows.find((workflow) => workflow.filename.toLowerCase() === lowered) ??
    workflows.find((workflow) => workflow.name.toLowerCase() === lowered) ??
    workflows.find((workflow) =>
      workflow.filename.toLowerCase().startsWith(lowered),
    );

  if (match) return match;

  throw new DeployPilotError(`No workflow matches '${needle}'.`, {
    hint: `Available:\n${workflows
      .map((workflow) => `  ${workflow.filename}  (${workflow.name})`)
      .join("\n")}`,
  });
}
