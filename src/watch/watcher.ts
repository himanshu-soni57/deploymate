import pc from "picocolors";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import { duration } from "../utils/format";
import type { RunsApi } from "../github/runs";
import type { WorkflowRun } from "../github/types";
import { extractFailure, renderJobs, statusIcon } from "./render";

export interface WatchOptions {
  interactive: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  /** Print the failing step's log tail when the run fails. */
  showLogs?: boolean;
}

export interface WatchResult {
  run: WorkflowRun;
  success: boolean;
  timedOut: boolean;
}

/**
 * Polls a run to completion and prints its job graph. This is what turns
 * DeployPilot from "a git push wrapper" into something that can tell you the
 * deployment actually failed.
 */
export async function watchRun(
  runs: RunsApi,
  runId: number,
  options: WatchOptions,
): Promise<WatchResult> {
  const interval = options.intervalMs ?? 4000;
  const deadline = Date.now() + (options.timeoutMs ?? 45 * 60_000);
  const spinner = createSpinner(options.interactive);

  let run = await runs.getRun(runId);
  let lastRendered = "";

  log.plain();
  log.info(`Watching run #${run.run_number}: ${pc.underline(run.html_url)}`);
  spinner.start("Waiting for jobs...");

  while (Date.now() < deadline) {
    run = await runs.getRun(runId);
    const jobs = await runs.listJobs(runId);

    const rendered = renderJobs(jobs);
    if (rendered !== lastRendered) {
      lastRendered = rendered;
      spinner.message(
        `${statusIcon(run.status, run.conclusion).trim()} - ${
          jobs.filter((job) => job.status === "completed").length
        }/${jobs.length} jobs done`,
      );
    }

    if (run.status === "waiting") {
      spinner.stop("Run is waiting for approval");
      log.warn(
        "A protected environment is blocking this run. A reviewer must approve it:",
      );
      log.plain(`  ${run.html_url}`);
      return { run, success: false, timedOut: false };
    }

    if (run.status === "completed") {
      spinner.stop();
      log.plain();
      log.plain(rendered);
      log.plain();

      const started = new Date(run.run_started_at ?? run.created_at).getTime();
      const took = duration(new Date(run.updated_at).getTime() - started);

      if (run.conclusion === "success") {
        log.success(`Run #${run.run_number} succeeded in ${took}`);
        log.plain(`  ${pc.dim(run.html_url)}`);
        return { run, success: true, timedOut: false };
      }

      log.error(`Run #${run.run_number} ${run.conclusion} after ${took}`);
      log.plain(`  ${pc.dim(run.html_url)}`);

      if (options.showLogs !== false) {
        await printFailures(runs, runId);
      }

      return { run, success: false, timedOut: false };
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  spinner.stop("Stopped watching");
  log.warn("Timed out waiting for the run to finish. It is still going:");
  log.plain(`  ${run.html_url}`);
  return { run, success: false, timedOut: true };
}

async function printFailures(runs: RunsApi, runId: number): Promise<void> {
  const jobs = await runs.listJobs(runId);
  const failed = jobs.filter((job) => job.conclusion === "failure");

  for (const job of failed) {
    const step = job.steps?.find((entry) => entry.conclusion === "failure");

    log.heading(`Failure in '${job.name}'${step ? ` at step '${step.name}'` : ""}`);

    const text = await runs.jobLogs(job.id);
    if (!text.trim()) {
      log.dim(`  Logs unavailable. Open ${job.html_url}`);
      continue;
    }

    log.plain(
      extractFailure(text)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
    log.plain(`  ${pc.dim(job.html_url)}`);
  }
}
