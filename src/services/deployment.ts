import pc from "picocolors";
import { CancelledError, DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { Transaction } from "../core/transaction";
import { runPreflight } from "../core/preflight";
import { runGate, runHook } from "../core/hooks";
import { selectionFromFlags, type ChangeSelection } from "../core/selection";
import type { DeployFlags } from "../core/flags";
import {
  BranchExecutor,
  DispatchExecutor,
  ReleaseExecutor,
  TagExecutor,
  runCommitPhase,
  type ExecutionResult,
} from "../executors";
import {
  askCommitMessage,
  buildInteractiveSelection,
  findWorkflow,
  gate,
  renderChanges,
  selectStrategy,
  selectWorkflow,
} from "../prompts";
import { discoverWorkflows, requireWorkflows } from "../workflow/discover";
import { buildPlan } from "../workflow/planner";
import { log } from "../ui/logger";
import { VERSION } from "../version";
import { watchRun } from "../watch/watcher";
import type { Workflow } from "../types/workflow";

export interface DeploymentOutcome {
  workflow: string;
  strategy: string;
  result: ExecutionResult;
  runUrl?: string;
  runConclusion?: string | null;
}

export class DeploymentService {
  static async run(flags: DeployFlags): Promise<DeploymentOutcome | null> {
    const context = await Context.create(flags);
    const transaction = new Transaction();

    banner(context, flags);

    const environment = context.environment(flags.environment);
    const environmentName =
      flags.environment ?? context.config.defaultEnvironment ?? null;

    try {
      return await this.execute(
        context,
        transaction,
        flags,
        environment,
        environmentName,
      );
    } catch (error) {
      await this.unwind(context, transaction, error);
      throw error;
    }
  }

  private static async execute(
    context: Context,
    transaction: Transaction,
    flags: DeployFlags,
    environment: ReturnType<Context["environment"]>,
    environmentName: string | null,
  ): Promise<DeploymentOutcome | null> {
    const workflows = requireWorkflows(
      await discoverWorkflows({ root: context.root, tolerant: true }),
    );

    const workflow = await this.resolveWorkflow(
      workflows,
      flags,
      environment.workflow,
      context.interactive,
    );

    const plan = buildPlan(workflow);
    const candidate = await selectStrategy(
      plan,
      context.interactive,
      flags.strategy ?? environment.strategy,
    );

    log.plain();
    log.success(`Workflow: ${pc.bold(workflow.name)} ${pc.dim(workflow.filename)}`);
    log.info(`Strategy: ${candidate.label} ${pc.dim(`(${candidate.hint})`)}`);
    if (environmentName) log.info(`Environment: ${environmentName}`);

    await runPreflight(context, {
      fetch: flags.fetch,
      force: flags.force,
      requireBranch: environment.requireBranch,
      requireClean: environment.requireClean,
      needsWorkingTree: candidate.strategy.kind !== "dispatch",
    });

    await runGate(environment.preDeploy, "Pre-deploy checks", {
      cwd: context.root,
      dryRun: context.dryRun,
    });

    const changes = await context.git.listChanges();
    if (changes.length) renderChanges(changes);

    const selection = await this.resolveSelection(context, flags, changes);

    const needsMessage =
      selection.mode !== "none" && !context.dryRun ? true : selection.mode !== "none";

    const message = needsMessage
      ? await askCommitMessage({
          interactive: context.interactive,
          provided: flags.message,
          convention: context.config.commit?.convention,
          template: context.config.commit?.template,
        })
      : null;

    await gate(
      environment.confirmWith,
      environmentName ?? workflow.name,
      context.interactive,
      flags.yes === true,
    );

    const commitResult = await runCommitPhase(context, {
      selection,
      changes,
      message,
      transaction,
      signoff: flags.signoff ?? context.config.commit?.signoff,
    });

    const result = await this.dispatchStrategy(
      context,
      transaction,
      flags,
      environment,
      workflow,
      candidate,
      commitResult.committed,
    );

    transaction.seal();

    const outcome: DeploymentOutcome = {
      workflow: workflow.filename,
      strategy: candidate.strategy.kind,
      result,
    };

    if (result.triggered && !context.dryRun) {
      const watched = await this.maybeWatch(context, flags, environment, result);
      if (watched) {
        outcome.runUrl = watched.url;
        outcome.runConclusion = watched.conclusion;

        await runHook(
          watched.success
            ? context.config.hooks?.onSuccess
            : context.config.hooks?.onFailure,
          watched.success ? "onSuccess" : "onFailure",
          { cwd: context.root, dryRun: context.dryRun },
        );

        if (!watched.success) {
          throw new DeployPilotError("The deployment run did not succeed.", {
            hint: watched.url,
          });
        }
      }
    }

    if (result.triggered) {
      await runGate(environment.postDeploy, "Post-deploy checks", {
        cwd: context.root,
        dryRun: context.dryRun,
      });
    }

    if (flags.json) {
      process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    }

    return outcome;
  }

  private static async resolveWorkflow(
    workflows: Workflow[],
    flags: DeployFlags,
    configured: string | undefined,
    interactive: boolean,
  ): Promise<Workflow> {
    const requested = flags.workflow ?? configured;
    if (requested) return findWorkflow(workflows, requested);
    return selectWorkflow(workflows, interactive);
  }

  private static async resolveSelection(
    context: Context,
    flags: DeployFlags,
    changes: Awaited<ReturnType<Context["git"]["listChanges"]>>,
  ): Promise<ChangeSelection> {
    const protectedPaths = context.config.protectedPaths ?? [];

    const fromFlags = selectionFromFlags(changes, flags, protectedPaths);
    if (fromFlags) return fromFlags;

    if (!changes.length) {
      return { mode: "none", paths: [], leftBehind: [], risky: [] };
    }

    if (!context.interactive) {
      // Without a prompt, committing is never implied. Deploying what already
      // exists is the safe default; --all opts into the other behaviour.
      log.warn(
        "Non-interactive run with a dirty working tree: deploying existing commits only. Pass --all or --file to include changes.",
      );
      return { mode: "none", paths: [], leftBehind: changes, risky: [] };
    }

    return buildInteractiveSelection(changes, protectedPaths, context.interactive);
  }

  private static async dispatchStrategy(
    context: Context,
    transaction: Transaction,
    flags: DeployFlags,
    environment: ReturnType<Context["environment"]>,
    workflow: Workflow,
    candidate: Awaited<ReturnType<typeof selectStrategy>>,
    committed: boolean,
  ): Promise<ExecutionResult> {
    switch (candidate.strategy.kind) {
      case "tag":
        return new TagExecutor(context).execute({
          strategy: candidate.strategy,
          workflowFile: workflow.filename,
          flags,
          transaction,
          committed,
          environmentTagPattern: environment.tagPattern,
          sign: flags.sign ?? environment.signTags,
          createRelease: environment.createRelease,
        });

      case "branch":
        return new BranchExecutor(context).execute({
          strategy: candidate.strategy,
          workflowFile: workflow.filename,
          flags,
          transaction,
          committed,
        });

      case "dispatch":
        return new DispatchExecutor(context).execute({
          strategy: candidate.strategy,
          workflowFile: workflow.filename,
          flags,
          defaultInputs: environment.inputs,
          committed,
        });

      case "release":
        return new ReleaseExecutor(context).execute({
          strategy: candidate.strategy,
          workflowFile: workflow.filename,
          flags,
          transaction,
          committed,
        });
    }
  }

  private static async maybeWatch(
    context: Context,
    flags: DeployFlags,
    environment: ReturnType<Context["environment"]>,
    result: ExecutionResult,
  ): Promise<{ url: string; success: boolean; conclusion: string | null } | null> {
    const shouldWatch = flags.watch ?? environment.watch ?? false;
    if (!shouldWatch || !result.lookup) return null;

    let runs;
    try {
      runs = await context.runs();
    } catch (error) {
      log.warn(
        `Cannot watch the run: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    log.plain();
    log.info("Looking for the triggered run...");

    const run = await runs.findTriggeredRun({
      ...result.lookup,
      notBefore: result.triggeredAt ?? Date.now(),
    });

    if (!run) {
      log.warn(
        "Could not find the run within the timeout. It may still start; check the Actions tab.",
      );
      return null;
    }

    const watched = await watchRun(runs, run.id, {
      interactive: context.interactive,
    });

    return {
      url: watched.run.html_url,
      success: watched.success,
      conclusion: watched.run.conclusion,
    };
  }

  private static async unwind(
    context: Context,
    transaction: Transaction,
    error: unknown,
  ): Promise<void> {
    if (transaction.isEmpty) return;
    if (context.dryRun) return;

    log.plain();
    log.warn("Deployment failed after making local changes:");
    for (const step of transaction.performed) log.plain(`    ${step}`);

    if (error instanceof CancelledError && !context.interactive) return;

    log.plain();
    log.info("Rolling back local changes...");
    await transaction.rollback();
  }
}

function banner(context: Context, flags: DeployFlags): void {
  if (flags.json || log.level === "silent") return;

  console.log();
  console.log(`${pc.cyan("DeployPilot")} ${pc.dim(`v${VERSION}`)}`);

  if (context.dryRun) {
    console.log(pc.yellow("dry run: nothing will be committed, pushed, or dispatched"));
  }
  if (context.configSource) {
    console.log(pc.dim(`config: ${context.configSource}`));
  }
}
