import pc from "picocolors";
import { confirm } from "@clack/prompts";
import { DeployPilotError } from "../errors";
import type { Context } from "../core/context";
import type { Transaction } from "../core/transaction";
import type { DeployFlags } from "../core/flags";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import { unwrap } from "../ui/prompt";
import { pluralize } from "../utils/format";
import { evaluateBranchPush } from "../workflow/triggers";
import { matchesAnyGlob } from "../utils/glob";
import type { BranchStrategy } from "../types/deployment";
import type { ExecutionResult } from "./types";

export interface BranchExecutorOptions {
  strategy: BranchStrategy;
  workflowFile: string;
  flags: DeployFlags;
  transaction: Transaction;
  committed: boolean;
}

export class BranchExecutor {
  constructor(private readonly context: Context) {}

  async execute(options: BranchExecutorOptions): Promise<ExecutionResult> {
    const { git } = this.context;
    const branch = this.context.repository.branch;

    if (!branch) {
      throw new DeployPilotError("Cannot deploy a branch from a detached HEAD.", {
        hint: "Check out a branch first: git switch <branch>",
      });
    }

    const { branches } = options.strategy;

    if (branches.length && !matchesAnyGlob(branch, branches)) {
      throw new DeployPilotError(
        `'${options.workflowFile}' only runs on ${branches.join(", ")}, but you are on '${branch}'.`,
        {
          hint:
            `Switch branches:\n  git switch ${branches[0]}\n\n` +
            "Or pick a workflow that watches this branch.",
        },
      );
    }

    const upstream = await git.getUpstream(branch);
    let { ahead } = upstream
      ? await git.aheadBehind(branch)
      : { ahead: await git.countCommits("HEAD") };

    // Everything is already pushed. A branch push cannot re-trigger anything,
    // so say so plainly instead of reporting a success that never happened.
    if (ahead === 0) {
      const resolved = await this.handleNothingToPush(branch, options);
      if (!resolved) {
        return {
          triggered: false,
          summary: `${this.context.remote}/${branch} is already up to date; nothing was pushed.`,
          ref: branch,
          sha: await git.headSha(),
        };
      }
      ahead = 1;
    }

    const range = upstream ? `${upstream}..HEAD` : "HEAD";
    const changedPaths = await git.changedPaths(range);

    const verdict = evaluateBranchPush(
      {
        branches: options.strategy.branches,
        "branches-ignore": options.strategy.ignore,
        paths: options.strategy.paths,
        "paths-ignore": options.strategy.pathsIgnore,
      },
      branch,
      changedPaths,
    );

    if (!verdict.triggers) {
      const proceed = await this.confirmNonTriggering(verdict.reason, options.flags);
      if (!proceed) {
        return {
          triggered: false,
          summary: `Push cancelled: ${verdict.reason}`,
          ref: branch,
        };
      }
    }

    if (options.flags.push === false) {
      log.warn("--no-push: commits were created locally but not pushed.");
      return {
        triggered: false,
        summary: `${pluralize(ahead, "commit")} ready to push.`,
        ref: branch,
        sha: await git.headSha(),
        commitCreated: options.committed,
      };
    }

    const spinner = createSpinner(this.context.interactive);
    const triggeredAt = Date.now();

    spinner.start(`Pushing ${pluralize(ahead, "commit")} to ${this.context.remote}/${branch}...`);
    await git.pushBranch(branch, this.context.remote, !upstream);
    spinner.stop(`Branch ${branch} pushed`);

    options.transaction.record("push branch", async () => {
      log.warn("A branch push cannot be undone automatically.");
    });

    const sha = await git.headSha();

    log.plain();
    log.success(`Deployment triggered on ${pc.bold(branch)}`);
    log.dim(`  commit ${sha.slice(0, 8)}`);

    return {
      triggered: true,
      summary: `Pushed ${pluralize(ahead, "commit")} to ${branch}`,
      ref: branch,
      sha,
      commitCreated: options.committed,
      triggeredAt,
      lookup: {
        workflowFile: options.workflowFile,
        headSha: sha,
        branch,
        event: "push",
      },
    };
  }

  /**
   * Offers the two honest ways forward when there is nothing new to push:
   * an empty commit, or (better) a manual dispatch if the workflow allows it.
   */
  private async handleNothingToPush(
    branch: string,
    options: BranchExecutorOptions,
  ): Promise<boolean> {
    log.plain();
    log.warn(
      `${this.context.remote}/${branch} already has every local commit. A branch push would be a no-op and would not start a workflow run.`,
    );

    if (options.flags.emptyCommit) {
      await this.context.git.emptyCommit(
        `chore: trigger ${options.workflowFile}`,
      );
      options.transaction.record("create empty commit", () =>
        this.context.git.resetSoft("HEAD~1"),
      );
      log.info("Created an empty commit to re-trigger the workflow.");
      return true;
    }

    if (!this.context.interactive) {
      log.info(
        "Re-run with --empty-commit to force a trigger, or use --strategy dispatch\n" +
          "if the workflow also declares workflow_dispatch.",
      );
      return false;
    }

    const proceed = unwrap(
      await confirm({
        message: "Create an empty commit to re-trigger the workflow?",
        initialValue: false,
      }),
    );

    if (!proceed) return false;

    await this.context.git.emptyCommit(`chore: trigger ${options.workflowFile}`);
    options.transaction.record("create empty commit", () =>
      this.context.git.resetSoft("HEAD~1"),
    );
    return true;
  }

  private async confirmNonTriggering(
    reason: string,
    flags: DeployFlags,
  ): Promise<boolean> {
    log.plain();
    log.warn(`This push will NOT start the workflow: ${reason}.`);

    if (flags.yes || flags.force) return true;
    if (!this.context.interactive) {
      log.info("Re-run with --force to push anyway.");
      return false;
    }

    return unwrap(
      await confirm({ message: "Push anyway?", initialValue: false }),
    );
  }
}
