import type {
  DeploymentPlan,
  StrategyCandidate,
} from "../types/deployment";
import type { Workflow } from "../types/workflow";

const RANK = { tag: 40, release: 30, branch: 20, dispatch: 10 } as const;

function describeRefs(refs: string[], fallback: string): string {
  if (!refs.length) return fallback;
  if (refs.length <= 3) return refs.join(", ");
  return `${refs.slice(0, 3).join(", ")} +${refs.length - 3} more`;
}

/**
 * Returns every strategy the workflow supports, ranked, instead of the first
 * match. A workflow with both `push.tags` and `workflow_dispatch` is common,
 * and the user should get to pick which one to use.
 */
export function buildPlan(workflow: Workflow): DeploymentPlan {
  const { on } = workflow;
  const candidates: StrategyCandidate[] = [];
  const blockers: string[] = [];

  if ("push" in on) {
    // `on: push` normalizes to a null value, which still means "any branch".
    const push = on.push ?? {};

    if (push.tags?.length) {
      candidates.push({
        strategy: {
          kind: "tag",
          patterns: push.tags,
          ignore: push["tags-ignore"] ?? [],
        },
        label: "Tag push",
        hint: describeRefs(push.tags, "any tag"),
        rank: RANK.tag,
      });
    }

    // A push block with tags AND branches supports both independently; one
    // with neither filter fires on every branch.
    if (push.branches?.length || !push.tags?.length) {
      candidates.push({
        strategy: {
          kind: "branch",
          branches: push.branches ?? [],
          ignore: push["branches-ignore"] ?? [],
          paths: push.paths ?? [],
          pathsIgnore: push["paths-ignore"] ?? [],
        },
        label: "Branch push",
        hint: describeRefs(push.branches ?? [], "any branch"),
        rank: RANK.branch,
      });
    }
  }

  if ("release" in on && on.release !== undefined) {
    const types = on.release?.types ?? [];
    candidates.push({
      strategy: { kind: "release", types },
      label: "GitHub Release",
      hint: types.length ? types.join(", ") : "published",
      rank: RANK.release,
    });
  }

  if ("workflow_dispatch" in on) {
    const inputs = on.workflow_dispatch?.inputs ?? {};
    const count = Object.keys(inputs).length;
    candidates.push({
      strategy: { kind: "dispatch", inputs },
      label: "Manual dispatch",
      hint: count ? `${count} input${count === 1 ? "" : "s"}` : "no inputs",
      rank: RANK.dispatch,
    });
  }

  if (!candidates.length) {
    const events = Object.keys(on);

    if (events.includes("workflow_call")) {
      blockers.push(
        "This is a reusable workflow (`workflow_call`). It only runs when another workflow calls it.",
      );
    }
    if (events.includes("schedule")) {
      blockers.push("This workflow is schedule-only and runs on GitHub's cron.");
    }
    if (events.some((event) => event.startsWith("pull_request"))) {
      blockers.push(
        "This workflow only runs on pull request events. Open or update a PR instead.",
      );
    }
    if (events.includes("repository_dispatch")) {
      blockers.push(
        "This workflow runs on `repository_dispatch`. Trigger it with:\n  deploypilot deploy --repository-dispatch <event-type>",
      );
    }
    if (!blockers.length) {
      blockers.push(
        events.length
          ? `No supported trigger. This workflow listens for: ${events.join(", ")}.`
          : "This workflow declares no `on:` triggers at all.",
      );
    }
  }

  candidates.sort((a, b) => b.rank - a.rank);

  return {
    workflowName: workflow.name,
    workflowFile: workflow.filename,
    candidates,
    blockers,
  };
}

export function isDeployable(workflow: Workflow): boolean {
  return buildPlan(workflow).candidates.length > 0;
}
