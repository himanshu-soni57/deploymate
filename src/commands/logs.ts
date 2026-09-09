import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { log } from "../ui/logger";
import { extractFailure, statusIcon } from "../watch/render";
import type { GlobalFlags } from "../core/flags";

export interface LogsFlags extends GlobalFlags {
  failedOnly?: boolean;
  job?: string;
}

export async function logsCommand(
  runId: string | undefined,
  flags: LogsFlags,
): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();

  const id = runId
    ? Number(runId)
    : (await runs.listRuns({ limit: 1 }))[0]?.id;

  if (!id || !Number.isFinite(id)) {
    throw new DeployPilotError("No run found.", {
      hint: "Pass a run id: deploypilot logs <run-id>",
    });
  }

  const run = await runs.getRun(id);
  const jobs = await runs.listJobs(id);

  log.heading(`Run #${run.run_number} - ${run.name ?? run.display_title}`);
  log.plain(`  ${statusIcon(run.status, run.conclusion).trim()}  ${pc.dim(run.html_url)}`);

  const selected = jobs.filter((job) => {
    if (flags.job) return job.name.toLowerCase().includes(flags.job.toLowerCase());
    if (flags.failedOnly !== false) return job.conclusion === "failure";
    return true;
  });

  const target = selected.length ? selected : jobs;

  for (const job of target) {
    log.heading(`${job.name} ${pc.dim(statusIcon(job.status, job.conclusion).trim())}`);

    const text = await runs.jobLogs(job.id);
    if (!text.trim()) {
      log.dim(`  Logs unavailable (they may have expired). ${job.html_url}`);
      continue;
    }

    const body =
      job.conclusion === "failure" && flags.failedOnly !== false
        ? extractFailure(text, 40)
        : text
            .split(/\r?\n/)
            .map((line) => line.replace(/^\S+Z\s/, ""))
            .join("\n");

    log.plain(
      body
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
  }

  log.plain();
}
