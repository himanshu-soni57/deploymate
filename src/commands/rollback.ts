import pc from "picocolors";
import { confirm, select, text } from "@clack/prompts";
import { CancelledError, DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { buildPlan } from "../workflow/planner";
import { findWorkflow, selectWorkflow } from "../prompts/workflow";
import { collectInputs, parseInputFlags } from "../prompts/inputs";
import { log } from "../ui/logger";
import { unwrap } from "../ui/prompt";
import { createSpinner } from "../ui/spinner";
import { relativeTime, truncate } from "../utils/format";
import { watchRun } from "../watch/watcher";
import type { WorkflowRun } from "../github/types";
import type { GlobalFlags } from "../core/flags";

export interface RollbackFlags extends GlobalFlags {
  workflow?: string;
  run?: string;
  input?: string[];
  watch?: boolean;
}

/**
 * Re-deploys a previously successful run. Two mechanisms, in order of
 * preference:
 *   1. workflow_dispatch at that run's commit  (clean, keeps history linear)
 *   2. GitHub's own re-run of the old run      (works for any event type)
 */
export async function rollbackCommand(flags: RollbackFlags): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();

  const workflows = await discoverWorkflows({ root: context.root, tolerant: true });

  const workflow = workflows.length
    ? flags.workflow
      ? findWorkflow(workflows, flags.workflow)
      : await selectWorkflow(workflows, context.interactive)
    : null;

  const history = await runs.listRuns({
    workflowFile: workflow?.filename,
    limit: 30,
  });

  const successful = history.filter((run) => run.conclusion === "success");

  if (!successful.length) {
    throw new DeployPilotError("No successful runs found to roll back to.");
  }

  const target = flags.run
    ? successful.find((run) => String(run.id) === flags.run || String(run.run_number) === flags.run)
    : await pickRun(successful, context.interactive);

  if (!target) {
    throw new DeployPilotError(`Run '${flags.run}' is not a successful run of this workflow.`);
  }

  log.plain();
  log.warn(
    `Rolling back to run #${target.run_number} (${target.head_sha.slice(0, 8)}, ${relativeTime(target.created_at)}).`,
  );
  log.plain(`  ${pc.dim(target.html_url)}`);
  log.plain();
  log.warn(
    "This re-deploys OLD code. Anything shipped since will be reverted in the deployed environment.",
  );

  if (!flags.yes) {
    context.requireInteractive("Rollback confirmation");
    const typed = unwrap(
      await text({
        message: `Type ${pc.bold("rollback")} to confirm`,
        validate: (value = "") =>
          value.trim() === "rollback" ? undefined : "Type: rollback",
      }),
    );
    if (typed.trim() !== "rollback") throw new CancelledError();
  }

  const plan = workflow ? buildPlan(workflow) : null;
  const dispatchCandidate = plan?.candidates.find(
    (candidate) => candidate.strategy.kind === "dispatch",
  );

  const spinner = createSpinner(context.interactive);

  if (dispatchCandidate && dispatchCandidate.strategy.kind === "dispatch") {
    const inputs = await collectInputs(dispatchCandidate.strategy.inputs, {
      interactive: context.interactive,
      provided: parseInputFlags(flags.input),
    });

    spinner.start(`Dispatching ${workflow!.filename} at ${target.head_sha.slice(0, 8)}...`);
    const api = await context.dispatch();
    await api.dispatchWorkflow(workflow!.filename, target.head_sha, inputs);
    spinner.stop("Rollback dispatched");
  } else {
    if (context.interactive && !flags.yes) {
      const proceed = unwrap(
        await confirm({
          message:
            "This workflow has no workflow_dispatch trigger. Re-run the original run instead?",
          initialValue: true,
        }),
      );
      if (!proceed) throw new CancelledError();
    }

    spinner.start(`Re-running run #${target.run_number}...`);
    await runs.rerun(target.id);
    spinner.stop("Rollback re-run requested");
  }

  log.plain();
  log.success(`Rollback started for ${target.head_sha.slice(0, 8)}.`);

  if (flags.watch) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const latest = (await runs.listRuns({ workflowFile: workflow?.filename, limit: 1 }))[0];
    if (latest) await watchRun(runs, latest.id, { interactive: context.interactive });
  }
}

async function pickRun(
  runs: WorkflowRun[],
  interactive: boolean,
): Promise<WorkflowRun> {
  if (!interactive) return runs[0]!;

  return unwrap(
    await select({
      message: "Roll back to which successful deployment?",
      options: runs.slice(0, 15).map((run) => ({
        value: run,
        label: `#${run.run_number}  ${truncate(run.display_title, 46)}`,
        hint: `${run.head_sha.slice(0, 8)} - ${run.actor?.login ?? "unknown"} - ${relativeTime(run.created_at)}`,
      })),
    }),
  );
}
