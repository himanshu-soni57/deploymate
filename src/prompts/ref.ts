import { select } from "@clack/prompts";
import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import { relativeTime, truncate } from "../utils/format";
import type { GitService } from "../git/service";

/**
 * Lets the user tag or dispatch against something other than HEAD, which is
 * how you deploy work that was committed and pushed some time ago.
 */
export async function chooseRef(
  git: GitService,
  options: {
    interactive: boolean;
    explicitRef?: string;
    message?: string;
    limit?: number;
  },
): Promise<{ ref: string; sha: string; subject: string }> {
  if (options.explicitRef) {
    if (!(await git.refExists(options.explicitRef))) {
      throw new DeployPilotError(`Ref '${options.explicitRef}' does not exist.`, {
        hint: "Use a branch name, tag, or commit SHA that exists locally.",
      });
    }
    const sha = await git.resolveRef(options.explicitRef);
    const [commit] = await git.recentCommits(1, sha);
    return {
      ref: options.explicitRef,
      sha,
      subject: commit?.subject ?? "",
    };
  }

  const commits = await git.recentCommits(options.limit ?? 15);

  if (!commits.length) {
    throw new DeployPilotError("No commits to deploy.");
  }

  if (!options.interactive) {
    return {
      ref: "HEAD",
      sha: commits[0]!.sha,
      subject: commits[0]!.subject,
    };
  }

  const chosen = unwrap(
    await select({
      message: options.message ?? "Which commit should be deployed?",
      options: commits.map((commit, index) => ({
        value: commit.sha,
        label:
          index === 0
            ? `${pc.bold("HEAD")}  ${truncate(commit.subject, 56)}`
            : `${pc.dim(commit.shortSha)}  ${truncate(commit.subject, 56)}`,
        hint: `${commit.author}, ${relativeTime(commit.date)}`,
      })),
    }),
  );

  const commit = commits.find((entry) => entry.sha === chosen)!;
  return { ref: commit.sha, sha: commit.sha, subject: commit.subject };
}
