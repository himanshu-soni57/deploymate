import pc from "picocolors";
import type { Workflow, WorkflowJob } from "../types/workflow";
import { buildPlan } from "./planner";

function list(values: string[] | undefined, fallback: string): string {
  if (!values?.length) return fallback;
  return values.map((value) => pc.cyan(value)).join(", ");
}

function describeTriggers(workflow: Workflow): string[] {
  const lines: string[] = [];
  const { on } = workflow;

  for (const event of Object.keys(on)) {
    switch (event) {
      case "push": {
        const push = on.push ?? {};
        if (push.tags?.length) {
          lines.push(
            `Pushing a tag matching ${list(push.tags, "any tag")} starts this workflow.`,
          );
        }
        if (push.branches?.length || !push.tags?.length) {
          let line = `Pushing to ${list(push.branches, "any branch")} starts this workflow.`;
          if (push["branches-ignore"]?.length) {
            line += ` Except ${list(push["branches-ignore"], "")}.`;
          }
          if (push.paths?.length) {
            line += ` Only when a changed file matches ${list(push.paths, "")}.`;
          }
          if (push["paths-ignore"]?.length) {
            line += ` Changes limited to ${list(push["paths-ignore"], "")} are ignored.`;
          }
          lines.push(line);
        }
        break;
      }
      case "pull_request":
      case "pull_request_target": {
        const pr = (on[event] ?? {}) as { branches?: string[] };
        lines.push(
          `Pull requests targeting ${list(pr.branches, "any branch")} start this workflow${
            event === "pull_request_target" ? " with repository secrets available" : ""
          }.`,
        );
        break;
      }
      case "workflow_dispatch": {
        const inputs = Object.keys(on.workflow_dispatch?.inputs ?? {});
        lines.push(
          inputs.length
            ? `It can be started manually, asking for: ${inputs.map((name) => pc.cyan(name)).join(", ")}.`
            : "It can be started manually from the Actions tab, or with `deploypilot deploy`.",
        );
        break;
      }
      case "release":
        lines.push(
          `Publishing a GitHub Release (${list(on.release?.types, "published")}) starts this workflow.`,
        );
        break;
      case "schedule": {
        const crons = (on.schedule ?? []).map((entry) => entry.cron);
        lines.push(`It runs on a schedule: ${list(crons, "unknown cron")}.`);
        break;
      }
      case "workflow_call":
        lines.push("It is a reusable workflow; other workflows call it directly.");
        break;
      case "repository_dispatch":
        lines.push(
          `An API repository_dispatch event (${list(on.repository_dispatch?.types, "any type")}) starts this workflow.`,
        );
        break;
      default:
        lines.push(`It also listens for the '${event}' event.`);
    }
  }

  return lines;
}

function describeJob(jobId: string, job: WorkflowJob): string[] {
  const lines: string[] = [];
  const needs = ([] as string[]).concat(job.needs ?? []);
  const runner = ([] as string[]).concat(job["runs-on"] ?? []).join(", ");

  let head = `${pc.bold(job.name ?? jobId)}`;
  if (runner) head += pc.dim(` on ${runner}`);
  if (job.uses) head += pc.dim(` (calls ${job.uses})`);
  lines.push(`  ${head}`);

  if (needs.length) {
    lines.push(`    waits for: ${needs.map((need) => pc.cyan(need)).join(", ")}`);
  }

  const environment =
    typeof job.environment === "string" ? job.environment : job.environment?.name;
  if (environment) {
    lines.push(
      `    deploys to environment ${pc.magenta(environment)} ${pc.dim("(may require approval)")}`,
    );
  }

  if (job.if) lines.push(`    only if: ${pc.dim(job.if)}`);

  if (job["timeout-minutes"]) {
    lines.push(`    timeout: ${job["timeout-minutes"]}m`);
  }

  const steps = job.steps ?? [];
  if (steps.length) {
    lines.push(`    ${steps.length} step${steps.length === 1 ? "" : "s"}`);
  }

  return lines;
}

/** Renders a plain-English description of when and how a workflow runs. */
export function explainWorkflow(workflow: Workflow): string {
  const lines: string[] = [];

  lines.push(pc.bold(workflow.name));
  lines.push(pc.dim(workflow.path));
  lines.push("");

  lines.push(pc.bold("When it runs"));
  const triggers = describeTriggers(workflow);
  if (!triggers.length) {
    lines.push(pc.red("  Nothing can trigger this workflow: it declares no events."));
  } else {
    for (const line of triggers) lines.push(`  ${line}`);
  }

  const concurrency = workflow.raw.concurrency;
  if (concurrency) {
    const group = typeof concurrency === "string" ? concurrency : concurrency.group;
    const cancels =
      typeof concurrency === "object" && concurrency["cancel-in-progress"];
    lines.push(
      `  Concurrency group ${pc.cyan(group)}${cancels ? ", cancelling any run in progress" : ", queued behind any run in progress"}.`,
    );
  }

  lines.push("");
  lines.push(pc.bold("What it does"));
  const jobs = Object.entries(workflow.jobs);
  if (!jobs.length) {
    lines.push(pc.red("  No jobs defined."));
  } else {
    for (const [jobId, job] of jobs) lines.push(...describeJob(jobId, job));
  }

  const permissions = workflow.raw.permissions;
  lines.push("");
  lines.push(pc.bold("Token permissions"));
  lines.push(
    permissions === undefined
      ? pc.yellow("  Not declared - GITHUB_TOKEN uses the repository default.")
      : `  ${typeof permissions === "string" ? permissions : Object.entries(permissions).map(([scope, level]) => `${scope}: ${level}`).join(", ")}`,
  );

  const plan = buildPlan(workflow);
  lines.push("");
  lines.push(pc.bold("How DeployPilot can trigger it"));
  if (!plan.candidates.length) {
    for (const blocker of plan.blockers) lines.push(`  ${pc.yellow(blocker)}`);
  } else {
    for (const candidate of plan.candidates) {
      lines.push(
        `  ${pc.green(candidate.label)} ${pc.dim(candidate.hint)}  ->  deploypilot deploy --workflow ${workflow.filename} --strategy ${candidate.strategy.kind}`,
      );
    }
  }

  return lines.join("\n");
}
