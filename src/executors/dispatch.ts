import pc from "picocolors";
import type { Context } from "../core/context";
import type { DeployFlags } from "../core/flags";
import { collectInputs, parseInputFlags } from "../prompts/inputs";
import { chooseRef } from "../prompts/ref";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import type { DispatchStrategy } from "../types/deployment";
import type { ExecutionResult } from "./types";

export interface DispatchExecutorOptions {
  strategy: DispatchStrategy;
  workflowFile: string;
  flags: DeployFlags;
  /** Defaults supplied by the environment config. */
  defaultInputs?: Record<string, string | number | boolean>;
  /** True when this run created a new commit that still needs pushing. */
  committed?: boolean;
}

/**
 * Actually fires workflow_dispatch through the GitHub API.
 *
 * The previous implementation only committed and pushed, which does nothing
 * for a dispatch-only workflow: it has no push trigger, so GitHub never
 * started a run while the CLI reported success.
 */
export class DispatchExecutor {
  constructor(private readonly context: Context) {}

  async execute(options: DispatchExecutorOptions): Promise<ExecutionResult> {
    const { git } = this.context;

    const ref =
      options.flags.ref ??
      this.context.repository.branch ??
      (await git.headSha());

    const target = await chooseRef(git, {
      interactive: false,
      explicitRef: ref,
    });

    let environments: string[] = [];
    const needsEnvironments = Object.values(options.strategy.inputs).some(
      (input) => input.type === "environment",
    );

    if (needsEnvironments) {
      try {
        environments = (await (await this.context.environments()).list()).map(
          (environment) => environment.name,
        );
      } catch {
        // Environments are optional metadata; fall back to a free text prompt.
      }
    }

    const inputs = await collectInputs(options.strategy.inputs, {
      interactive: this.context.interactive,
      provided: {
        ...options.defaultInputs,
        ...parseInputFlags(options.flags.input),
      },
      environments,
    });

    // A dispatch runs the workflow definition on the remote ref, so anything
    // still sitting unpushed locally will not be part of it.
    const branch = this.context.repository.branch;
    if (branch) {
      const upstream = await git.getUpstream(branch);
      const { ahead } = upstream
        ? await git.aheadBehind(branch)
        : { ahead: await git.countCommits("HEAD") };

      if (ahead > 0 && options.committed && options.flags.push !== false) {
        const pushSpinner = createSpinner(this.context.interactive);
        pushSpinner.start(`Pushing ${ahead} commit(s) before dispatching...`);
        await git.pushBranch(branch, this.context.remote, !upstream);
        pushSpinner.stop("Branch pushed");
      } else if (ahead > 0) {
        log.warn(
          `${ahead} local commit(s) are not pushed. The dispatch runs against ${this.context.remote}/${branch} as it exists now.`,
        );
      }
    }

    if (Object.keys(inputs).length) {
      log.heading("Inputs");
      for (const [key, value] of Object.entries(inputs)) {
        log.plain(`  ${key} ${pc.dim("=")} ${value}`);
      }
    }

    const spinner = createSpinner(this.context.interactive);
    const triggeredAt = Date.now();

    spinner.start(`Dispatching ${options.workflowFile}...`);
    const api = await this.context.dispatch();
    await api.dispatchWorkflow(options.workflowFile, ref, inputs);
    spinner.stop("Workflow dispatched");

    log.plain();
    log.success(`Dispatched ${pc.bold(options.workflowFile)} on ${pc.bold(ref)}`);

    return {
      triggered: true,
      summary: `Dispatched ${options.workflowFile} on ${ref}`,
      ref,
      sha: target.sha,
      triggeredAt,
      lookup: {
        workflowFile: options.workflowFile,
        branch: ref,
        event: "workflow_dispatch",
      },
    };
  }
}
