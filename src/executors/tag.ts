import pc from "picocolors";
import { DeployPilotError } from "../errors";
import type { Context } from "../core/context";
import type { Transaction } from "../core/transaction";
import { buildChangelog, inferReleaseType } from "../versioning";
import { chooseTag } from "../prompts/tag";
import { chooseRef } from "../prompts/ref";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import { evaluateTagPush } from "../workflow/triggers";
import type { TagStrategy } from "../types/deployment";
import type { DeployFlags } from "../core/flags";
import type { ExecutionResult } from "./types";

export interface TagExecutorOptions {
  strategy: TagStrategy;
  workflowFile: string;
  flags: DeployFlags;
  transaction: Transaction;
  /** True when this run created a new commit. */
  committed: boolean;
  environmentTagPattern?: string;
  sign?: boolean;
  createRelease?: boolean;
}

export class TagExecutor {
  constructor(private readonly context: Context) {}

  async execute(options: TagExecutorOptions): Promise<ExecutionResult> {
    const { git } = this.context;
    const spinner = createSpinner(this.context.interactive);

    const patterns = options.environmentTagPattern
      ? [options.environmentTagPattern]
      : options.strategy.patterns;

    // When nothing new was committed, the user may want to tag an older
    // commit rather than HEAD. This is the "deploy what is already pushed"
    // path, and it is a first-class flow rather than a fallback.
    const target = options.committed
      ? { ref: "HEAD", sha: await git.headSha(), subject: "" }
      : await chooseRef(git, {
          interactive: this.context.interactive && !options.flags.ref,
          explicitRef: options.flags.ref,
          message: "Tag which commit?",
        });

    const existingTags = await git.listTags();
    const lastMatching = existingTags.find((tag) =>
      patterns.some((pattern) => tag.startsWith(pattern.split("*")[0] ?? "")),
    );

    const commitsSinceTag = await git.commitsBetween(
      lastMatching ?? null,
      target.sha,
    );
    const inferred = commitsSinceTag.length
      ? inferReleaseType(commitsSinceTag)
      : null;

    const choice = await chooseTag({
      patterns,
      existingTags,
      interactive: this.context.interactive,
      explicitTag: options.flags.tag,
      bump: options.flags.bump,
      inferred,
    });

    const verdict = evaluateTagPush(
      { tags: options.strategy.patterns, "tags-ignore": options.strategy.ignore },
      choice.tag,
    );

    if (!verdict.triggers) {
      throw new DeployPilotError(
        `Tag '${choice.tag}' would not trigger '${options.workflowFile}'.`,
        { hint: `Reason: ${verdict.reason}` },
      );
    }

    if (await git.tagExists(choice.tag)) {
      throw new DeployPilotError(`Tag '${choice.tag}' already exists locally.`, {
        hint:
          `Pick a different tag, or remove the old one:\n  git tag -d ${choice.tag}\n\n` +
          "This usually means a previous deployment failed after creating the tag.",
      });
    }

    spinner.start("Checking the remote for the tag...");
    const onRemote = await git.remoteTagExists(choice.tag, this.context.remote);
    spinner.stop("Remote checked");

    if (onRemote) {
      throw new DeployPilotError(
        `Tag '${choice.tag}' already exists on ${this.context.remote}.`,
        { hint: "Choose a different tag; overwriting a pushed tag breaks anyone who fetched it." },
      );
    }

    const changelog = buildChangelog(commitsSinceTag, {
      from: lastMatching ?? null,
      to: choice.tag,
    });

    const branch = this.context.repository.branch;
    let pushedBranch = false;

    // Push the branch first, so the tagged commit exists on the remote before
    // the tag that points at it.
    if (branch) {
      const upstream = await git.getUpstream(branch);
      const { ahead } = upstream
        ? await git.aheadBehind(branch)
        : { ahead: await git.countCommits("HEAD") };

      if (ahead > 0 && options.flags.push !== false) {
        spinner.start(`Pushing ${ahead} commit(s) to ${this.context.remote}/${branch}...`);
        await git.pushBranch(branch, this.context.remote, !upstream);
        spinner.stop(`Branch ${branch} pushed`);
        pushedBranch = true;
        options.transaction.record("push branch", async () => {
          log.warn(
            `The branch push to ${this.context.remote}/${branch} cannot be undone automatically.`,
          );
        });
      } else if (ahead === 0) {
        log.info(
          `${this.context.remote}/${branch} is already up to date; tagging the pushed commit.`,
        );
      }
    }

    spinner.start(`Creating tag ${choice.tag}...`);
    await git.createTag(choice.tag, {
      ref: target.ref === "HEAD" ? undefined : target.sha,
      message: `${choice.tag}\n\n${changelog}`,
      sign: options.sign,
    });
    spinner.stop(`Tag ${choice.tag} created`);

    options.transaction.record(`create tag ${choice.tag}`, () =>
      git.deleteLocalTag(choice.tag),
    );

    if (options.flags.push === false) {
      log.warn("--no-push: the tag was created locally but not pushed.");
      return {
        triggered: false,
        summary: `Created tag ${choice.tag} locally (not pushed).`,
        tag: choice.tag,
        sha: target.sha,
        commitCreated: options.committed,
      };
    }

    const triggeredAt = Date.now();

    spinner.start(`Pushing tag ${choice.tag}...`);
    await git.pushTag(choice.tag, this.context.remote);
    spinner.stop(`Tag ${choice.tag} pushed`);

    options.transaction.record(`push tag ${choice.tag}`, () =>
      git.deleteRemoteTag(choice.tag, this.context.remote),
    );

    if (options.createRelease || options.flags.release) {
      await this.createRelease(choice.tag, changelog, target.sha);
    }

    log.plain();
    log.success(`Deployment triggered: ${pc.bold(choice.tag)}`);
    if (pushedBranch) log.dim(`  branch ${branch} pushed`);
    log.dim(`  commit ${target.sha.slice(0, 8)}`);

    return {
      triggered: true,
      summary: `Pushed tag ${choice.tag}`,
      tag: choice.tag,
      ref: choice.tag,
      sha: target.sha,
      commitCreated: options.committed,
      triggeredAt,
      lookup: {
        workflowFile: options.workflowFile,
        headSha: target.sha,
        event: "push",
      },
    };
  }

  private async createRelease(
    tag: string,
    changelog: string,
    sha: string,
  ): Promise<void> {
    const spinner = createSpinner(this.context.interactive);
    spinner.start("Creating GitHub Release...");

    try {
      const releases = await this.context.releases();
      const release = await releases.create({
        tag,
        name: tag,
        body: changelog,
        targetCommitish: sha,
      });
      spinner.stop("Release created");
      if (release?.html_url) log.dim(`  ${release.html_url}`);
    } catch (error) {
      spinner.stop();
      log.warn(
        `Tag pushed, but the release could not be created: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
