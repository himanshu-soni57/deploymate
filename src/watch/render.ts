import pc from "picocolors";
import { duration } from "../utils/format";
import type { RunConclusion, RunStatus, WorkflowJob, WorkflowRun } from "../github/types";

export function statusIcon(status: RunStatus, conclusion: RunConclusion): string {
  if (status !== "completed") {
    if (status === "queued" || status === "pending" || status === "requested") {
      return pc.dim("queued  ");
    }
    if (status === "waiting") return pc.magenta("waiting ");
    return pc.yellow("running ");
  }

  switch (conclusion) {
    case "success":
      return pc.green("passed  ");
    case "failure":
      return pc.red("failed  ");
    case "cancelled":
      return pc.dim("cancelled");
    case "skipped":
      return pc.dim("skipped ");
    case "timed_out":
      return pc.red("timeout ");
    case "action_required":
      return pc.magenta("approval");
    default:
      return pc.dim(String(conclusion ?? "done"));
  }
}

export function elapsed(job: WorkflowJob): string {
  if (!job.started_at) return "";
  const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  return duration(end - new Date(job.started_at).getTime());
}

export function renderJobs(jobs: WorkflowJob[]): string {
  return jobs
    .map((job) => {
      const time = elapsed(job);
      const head = `  ${statusIcon(job.status, job.conclusion)}  ${job.name}${
        time ? pc.dim(`  ${time}`) : ""
      }`;

      if (job.status === "completed" && job.conclusion !== "failure") return head;

      const steps = (job.steps ?? [])
        .filter((step) => step.status !== "completed" || step.conclusion === "failure")
        .slice(0, 4)
        .map(
          (step) =>
            `      ${statusIcon(step.status, step.conclusion)}  ${pc.dim(step.name)}`,
        );

      return [head, ...steps].join("\n");
    })
    .join("\n");
}

export function runHeadline(run: WorkflowRun): string {
  return `${run.name ?? run.display_title} ${pc.dim(`#${run.run_number}`)} - ${statusIcon(
    run.status,
    run.conclusion,
  ).trim()}`;
}

const ERROR_MARKER = "##[error]";

/** Pulls the useful part out of a job log instead of dumping megabytes. */
export function extractFailure(logText: string, contextLines = 25): string {
  const lines = logText.split(/\r?\n/);
  const errorIndex = lines.findIndex((line) => line.includes(ERROR_MARKER));

  const slice =
    errorIndex === -1
      ? lines.slice(-contextLines)
      : lines.slice(Math.max(0, errorIndex - contextLines), errorIndex + 5);

  return slice
    .map((line) => line.replace(/^\S+Z\s/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) =>
      line.includes(ERROR_MARKER)
        ? pc.red(line.replace(ERROR_MARKER, ""))
        : pc.dim(line),
    )
    .join("\n");
}
