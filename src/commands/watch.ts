import { DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { findWorkflow } from "../prompts/workflow";
import { log } from "../ui/logger";
import { watchRun } from "../watch/watcher";
import type { GlobalFlags } from "../core/flags";

export interface WatchFlags extends GlobalFlags {
  workflow?: string;
  branch?: string;
}

/** Resolves "the run I care about" when no id is given: the latest active one. */
async function resolveRunId(
  context: Context,
  flags: WatchFlags,
  explicit?: string,
): Promise<number> {
  if (explicit) {
    const id = Number(explicit);
    if (!Number.isFinite(id)) {
      throw new DeployPilotError(`'${explicit}' is not a run id.`);
    }
    return id;
  }

  const runs = await context.runs();
  let workflowFile: string | undefined;

  if (flags.workflow) {
    const workflows = await discoverWorkflows({ root: context.root, tolerant: true });
    workflowFile = workflows.length
      ? findWorkflow(workflows, flags.workflow).filename
      : flags.workflow;
  }

  const branch = flags.branch ?? context.repository.branch ?? undefined;

  const active =
    (await runs.listRuns({ workflowFile, branch, status: "in_progress", limit: 5 }))[0] ??
    (await runs.listRuns({ workflowFile, branch, status: "queued", limit: 5 }))[0] ??
    (await runs.listRuns({ workflowFile, branch, limit: 1 }))[0];

  if (!active) {
    throw new DeployPilotError("No workflow runs found to watch.", {
      hint: "Pass a run id explicitly: deploypilot watch <run-id>",
    });
  }

  return active.id;
}

export async function watchCommand(
  runId: string | undefined,
  flags: WatchFlags,
): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();
  const id = await resolveRunId(context, flags, runId);

  const result = await watchRun(runs, id, { interactive: context.interactive });

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result.run, null, 2)}\n`);
  }

  if (!result.success && !result.timedOut) {
    process.exitCode = 1;
  }

  log.plain();
}
