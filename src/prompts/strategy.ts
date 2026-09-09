import { select } from "@clack/prompts";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import type { DeploymentPlan, StrategyCandidate } from "../types/deployment";

export async function selectStrategy(
  plan: DeploymentPlan,
  interactive: boolean,
  forced?: string,
): Promise<StrategyCandidate> {
  if (!plan.candidates.length) {
    throw new DeployPilotError(
      `'${plan.workflowName}' cannot be triggered by DeployPilot.`,
      { hint: plan.blockers.join("\n\n") },
    );
  }

  if (forced) {
    const match = plan.candidates.find(
      (candidate) => candidate.strategy.kind === forced,
    );
    if (!match) {
      throw new DeployPilotError(
        `'${plan.workflowName}' does not support the '${forced}' strategy.`,
        {
          hint: `Supported: ${plan.candidates
            .map((candidate) => candidate.strategy.kind)
            .join(", ")}`,
        },
      );
    }
    return match;
  }

  if (plan.candidates.length === 1 || !interactive) {
    return plan.candidates[0]!;
  }

  return unwrap(
    await select({
      message: "This workflow supports several triggers. Which one?",
      options: plan.candidates.map((candidate) => ({
        value: candidate,
        label: candidate.label,
        hint: candidate.hint,
      })),
    }),
  );
}
