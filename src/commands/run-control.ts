import { confirm } from "@clack/prompts";
import { CancelledError, DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { log } from "../ui/logger";
import { unwrap } from "../ui/prompt";
import { statusIcon } from "../watch/render";
import { watchRun } from "../watch/watcher";
import type { GlobalFlags } from "../core/flags";

async function latestRunId(context: Context, activeOnly: boolean): Promise<number> {
  const runs = await context.runs();
  const branch = context.repository.branch ?? undefined;

  const found = activeOnly
    ? ((await runs.listRuns({ branch, status: "in_progress", limit: 1 }))[0] ??
      (await runs.listRuns({ branch, status: "queued", limit: 1 }))[0])
    : (await runs.listRuns({ branch, limit: 1 }))[0];

  if (!found) {
    throw new DeployPilotError(
      activeOnly ? "No run is currently in progress." : "No runs found.",
    );
  }

  return found.id;
}

export async function cancelCommand(
  runId: string | undefined,
  flags: GlobalFlags,
): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();
  const id = runId ? Number(runId) : await latestRunId(context, true);

  const run = await runs.getRun(id);

  log.info(
    `Run #${run.run_number} (${run.name ?? run.display_title}) - ${statusIcon(run.status, run.conclusion).trim()}`,
  );

  if (context.interactive && !flags.yes) {
    const proceed = unwrap(
      await confirm({ message: `Cancel run #${run.run_number}?`, initialValue: false }),
    );
    if (!proceed) throw new CancelledError();
  }

  await runs.cancelRun(id);
  log.success(`Cancellation requested for run #${run.run_number}.`);
  log.dim(`  ${run.html_url}`);
}

export interface RerunFlags extends GlobalFlags {
  failed?: boolean;
  watch?: boolean;
}

export async function rerunCommand(
  runId: string | undefined,
  flags: RerunFlags,
): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();
  const id = runId ? Number(runId) : await latestRunId(context, false);

  const run = await runs.getRun(id);
  const scope = flags.failed ? "failed jobs of" : "all jobs of";

  if (context.interactive && !flags.yes) {
    const proceed = unwrap(
      await confirm({
        message: `Re-run ${scope} #${run.run_number} (${run.name ?? run.display_title})?`,
        initialValue: true,
      }),
    );
    if (!proceed) throw new CancelledError();
  }

  await runs.rerun(id, flags.failed);
  log.success(`Re-run requested for #${run.run_number}.`);

  if (flags.watch) {
    // GitHub needs a moment to reset the run before its status is meaningful.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await watchRun(runs, id, { interactive: context.interactive });
  } else {
    log.dim(`  ${run.html_url}`);
  }
}
