import pc from "picocolors";
import { confirm } from "@clack/prompts";
import type { Context } from "../core/context";
import type { DeployFlags } from "../core/flags";
import type { Transaction } from "../core/transaction";
import { chooseTag } from "../prompts/tag";
import { chooseRef } from "../prompts/ref";
import { buildChangelog, inferReleaseType } from "../versioning";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import { unwrap } from "../ui/prompt";
import type { ReleaseStrategy } from "../types/deployment";
import type { ExecutionResult } from "./types";

export interface ReleaseExecutorOptions {
  strategy: ReleaseStrategy;
  workflowFile: string;
  flags: DeployFlags;
  transaction: Transaction;
  committed: boolean;
}

/**
 * Publishes a GitHub Release, which is what `on: release` workflows listen
 * for. The old planner reported these as "unknown" and refused to act.
 */
export class ReleaseExecutor {
  constructor(private readonly context: Context) {}

  async execute(options: ReleaseExecutorOptions): Promise<ExecutionResult> {
    const { git } = this.context;
    const spinner = createSpinner(this.context.interactive);

    const target = options.committed
      ? { ref: "HEAD", sha: await git.headSha(), subject: "" }
      : await chooseRef(git, {
          interactive: this.context.interactive && !options.flags.ref,
          explicitRef: options.flags.ref,
          message: "Release which commit?",
        });

    const existingTags = await git.listTags();
    const lastTag = existingTags[0] ?? null;
    const commits = await git.commitsBetween(lastTag, target.sha);

    const choice = await chooseTag({
      patterns: ["v*.*.*"],
      existingTags,
      interactive: this.context.interactive,
      explicitTag: options.flags.tag,
      bump: options.flags.bump,
      inferred: commits.length ? inferReleaseType(commits) : null,
    });

    const changelog = buildChangelog(commits, { from: lastTag, to: choice.tag });

    const prerelease =
      choice.tag.includes("-") &&
      (this.context.flags.yes === true ||
        !this.context.interactive ||
        unwrap(
          await confirm({
            message: `'${choice.tag}' looks like a prerelease. Mark it as one?`,
            initialValue: true,
          }),
        ));

    const branch = this.context.repository.branch;
    if (branch && options.flags.push !== false) {
      const upstream = await git.getUpstream(branch);
      const { ahead } = upstream
        ? await git.aheadBehind(branch)
        : { ahead: await git.countCommits("HEAD") };

      if (ahead > 0) {
        spinner.start(`Pushing ${ahead} commit(s)...`);
        await git.pushBranch(branch, this.context.remote, !upstream);
        spinner.stop("Branch pushed");
      }
    }

    const triggeredAt = Date.now();

    spinner.start(`Creating release ${choice.tag}...`);
    const releases = await this.context.releases();
    const release = await releases.create({
      tag: choice.tag,
      name: choice.tag,
      body: changelog,
      prerelease,
      targetCommitish: target.sha,
    });
    spinner.stop("Release created");

    options.transaction.record(`create release ${choice.tag}`, async () => {
      log.warn(
        `The GitHub Release '${choice.tag}' must be deleted manually if you want it gone.`,
      );
    });

    log.plain();
    log.success(`Released ${pc.bold(choice.tag)}`);
    if (release?.html_url) log.dim(`  ${release.html_url}`);

    return {
      triggered: true,
      summary: `Published release ${choice.tag}`,
      tag: choice.tag,
      ref: choice.tag,
      sha: target.sha,
      commitCreated: options.committed,
      triggeredAt,
      lookup: {
        workflowFile: options.workflowFile,
        event: "release",
      },
    };
  }
}
