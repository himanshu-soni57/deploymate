import simpleGit, { type SimpleGit } from "simple-git";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";
import type {
  CommitSummary,
  FileChange,
  FileChangeKind,
  GitRepository,
  GitStatus,
} from "../types/git";

function classify(index: string, worktree: string): FileChangeKind {
  const code = index === " " || index === "?" ? worktree : index;
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "?":
      return "untracked";
    case "U":
      return "conflicted";
    case "T":
      return "typechange";
    default:
      return "modified";
  }
}

export interface CommitOptions {
  signoff?: boolean;
  /** Restrict the commit to these pathspecs, ignoring anything else staged. */
  only?: string[];
  allowEmpty?: boolean;
}

export interface TagOptions {
  ref?: string;
  message?: string;
  sign?: boolean;
  force?: boolean;
}

export class GitService {
  private readonly git: SimpleGit;

  constructor(
    private readonly options: { cwd?: string; dryRun?: boolean } = {},
  ) {
    this.git = simpleGit(options.cwd ?? process.cwd());
  }

  private get dryRun(): boolean {
    return this.options.dryRun === true;
  }

  private plan(description: string): boolean {
    if (!this.dryRun) return false;
    const [firstLine = ""] = description.split("\n");
    log.dryRun(
      firstLine.length < description.length ? `${firstLine} ...` : description,
    );
    return true;
  }

  // ---------------------------------------------------------------- reads

  async isRepository(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async getRoot(): Promise<string> {
    return (await this.git.revparse(["--show-toplevel"])).trim();
  }

  async headSha(): Promise<string> {
    try {
      return (await this.git.revparse(["HEAD"])).trim();
    } catch {
      return "";
    }
  }

  async hasCommits(): Promise<boolean> {
    return (await this.headSha()) !== "";
  }

  async isDetached(): Promise<boolean> {
    const ref = (await this.git.revparse(["--abbrev-ref", "HEAD"])).trim();
    return ref === "HEAD";
  }

  async getRepository(): Promise<GitRepository> {
    const [root, remotes, headSha, detached] = await Promise.all([
      this.getRoot(),
      this.git.getRemotes(true),
      this.headSha(),
      this.isDetached(),
    ]);

    const branch = detached
      ? null
      : (await this.git.revparse(["--abbrev-ref", "HEAD"])).trim();

    return {
      root,
      branch,
      detached,
      headSha,
      remotes: remotes.map((remote) => ({
        name: remote.name,
        fetch: remote.refs.fetch,
        push: remote.refs.push,
      })),
    };
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();

    const files: FileChange[] = status.files.map((file) => {
      const index = file.index || " ";
      const worktree = file.working_dir || " ";
      const untracked = index === "?" || worktree === "?";

      return {
        path: file.path,
        from: (file as { from?: string }).from,
        index,
        worktree,
        kind: classify(index, worktree),
        staged: !untracked && index !== " ",
        unstaged: untracked || worktree !== " ",
      };
    });

    return {
      branch: status.current,
      detached: status.detached === true,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      clean: files.length === 0,
      files,
    };
  }

  async listChanges(): Promise<FileChange[]> {
    return (await this.getStatus()).files;
  }

  async hasChanges(): Promise<boolean> {
    return !(await this.getStatus()).clean;
  }

  async getStagedPaths(): Promise<string[]> {
    return (await this.listChanges())
      .filter((file) => file.staged)
      .map((file) => file.path);
  }

  async getCurrentBranch(): Promise<string | null> {
    return (await this.getStatus()).branch;
  }

  async getUpstream(branch: string): Promise<string | null> {
    try {
      return (
        await this.git.revparse([
          "--abbrev-ref",
          "--symbolic-full-name",
          `${branch}@{upstream}`,
        ])
      ).trim();
    } catch {
      return null;
    }
  }

  /** Counts relative to the tracked upstream. Run fetch() first for accuracy. */
  async aheadBehind(branch: string): Promise<{ ahead: number; behind: number }> {
    const upstream = await this.getUpstream(branch);
    if (!upstream) return { ahead: 0, behind: 0 };

    const output = await this.git.raw([
      "rev-list",
      "--left-right",
      "--count",
      `${upstream}...${branch}`,
    ]);

    const [behind = "0", ahead = "0"] = output.trim().split(/\s+/);
    return { ahead: Number(ahead), behind: Number(behind) };
  }

  async listTags(): Promise<string[]> {
    const tags = await this.git.tags(["--sort=-creatordate"]);
    return tags.all;
  }

  async tagExists(tag: string): Promise<boolean> {
    return (await this.listTags()).includes(tag);
  }

  async remoteTagExists(tag: string, remote = "origin"): Promise<boolean> {
    try {
      const output = await this.git.listRemote(["--tags", remote, tag]);
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getRemoteUrl(remote = "origin"): Promise<string | null> {
    const remotes = await this.git.getRemotes(true);
    const found = remotes.find((entry) => entry.name === remote);
    return found?.refs.fetch || found?.refs.push || null;
  }

  async refExists(ref: string): Promise<boolean> {
    try {
      await this.git.revparse([`${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  async resolveRef(ref: string): Promise<string> {
    return (await this.git.revparse([`${ref}^{commit}`])).trim();
  }

  async recentCommits(count = 20, ref = "HEAD"): Promise<CommitSummary[]> {
    if (!(await this.hasCommits())) return [];

    const separator = "<<|dp|>>";
    const output = await this.git.raw([
      "log",
      `-${count}`,
      `--pretty=format:%H${separator}%h${separator}%s${separator}%an${separator}%aI${separator}%b<<|end|>>`,
      ref,
    ]);

    return output
      .split("<<|end|>>")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [sha = "", shortSha = "", subject = "", author = "", date = "", body = ""] =
          entry.split(separator);
        return { sha, shortSha, subject, author, date, body: body.trim() };
      });
  }

  /** Commits reachable from `to` but not `from`. Used for changelogs. */
  async commitsBetween(from: string | null, to = "HEAD"): Promise<CommitSummary[]> {
    if (!(await this.hasCommits())) return [];
    const range = from ? `${from}..${to}` : to;
    const separator = "<<|dp|>>";

    const output = await this.git.raw([
      "log",
      `--pretty=format:%H${separator}%h${separator}%s${separator}%an${separator}%aI${separator}%b<<|end|>>`,
      range,
    ]);

    return output
      .split("<<|end|>>")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [sha = "", shortSha = "", subject = "", author = "", date = "", body = ""] =
          entry.split(separator);
        return { sha, shortSha, subject, author, date, body: body.trim() };
      });
  }

  async diffStat(paths?: string[]): Promise<string> {
    const args = ["diff", "--stat", "HEAD"];
    if (paths?.length) args.push("--", ...paths);
    try {
      return (await this.git.raw(args)).trim();
    } catch {
      return "";
    }
  }

  // ------------------------------------------------------------- mutations

  async fetch(remote = "origin"): Promise<void> {
    if (this.plan(`git fetch ${remote} --tags --prune`)) return;
    await this.git.fetch(remote, ["--tags", "--prune"]);
  }

  async stageAll(): Promise<void> {
    if (this.plan("git add -A")) return;
    await this.git.raw(["add", "-A"]);
  }

  async stagePaths(paths: string[]): Promise<void> {
    if (!paths.length) return;
    if (this.plan(`git add -- ${paths.join(" ")}`)) return;
    await this.git.raw(["add", "--", ...paths]);
  }

  async unstagePaths(paths: string[]): Promise<void> {
    if (!paths.length) return;
    if (this.plan(`git restore --staged -- ${paths.join(" ")}`)) return;
    try {
      await this.git.raw(["restore", "--staged", "--", ...paths]);
    } catch {
      // Repository has no commits yet; `git rm --cached` is the fallback.
      await this.git.raw(["rm", "--cached", "-r", "--", ...paths]);
    }
  }

  async commit(message: string, options: CommitOptions = {}): Promise<string> {
    const args = ["commit", "-m", message];
    if (options.signoff) args.push("--signoff");
    if (options.allowEmpty) args.push("--allow-empty");
    if (options.only?.length) args.push("--only", "--", ...options.only);

    if (this.plan(`git ${args.join(" ")}`)) return "dry-run";

    await this.git.raw(args);
    return this.headSha();
  }

  async createTag(tag: string, options: TagOptions = {}): Promise<void> {
    // `git tag` defaults to --cleanup=strip, which deletes every line starting
    // with '#'. That silently ate the markdown headings out of the changelog.
    const args = ["tag", "--cleanup=verbatim"];

    if (options.sign) args.push("-s");
    else args.push("-a");

    args.push("-m", options.message ?? tag);
    if (options.force) args.push("-f");
    args.push(tag);
    if (options.ref) args.push(options.ref);

    if (this.plan(`git ${args.join(" ")}`)) return;
    await this.git.raw(args);
  }

  async deleteLocalTag(tag: string): Promise<void> {
    if (this.plan(`git tag -d ${tag}`)) return;
    await this.git.raw(["tag", "-d", tag]);
  }

  async deleteRemoteTag(tag: string, remote = "origin"): Promise<void> {
    if (this.plan(`git push ${remote} :refs/tags/${tag}`)) return;
    await this.git.raw(["push", remote, `:refs/tags/${tag}`]);
  }

  async pushBranch(
    branch: string,
    remote = "origin",
    setUpstream = false,
  ): Promise<void> {
    const args = ["push"];
    if (setUpstream) args.push("--set-upstream");
    args.push(remote, branch);

    if (this.plan(`git ${args.join(" ")}`)) return;

    try {
      await this.git.raw(args);
    } catch (error) {
      throw new DeployPilotError(`Failed to push branch '${branch}'.`, {
        hint:
          "The remote may have moved ahead. Run `git pull --rebase` and try again,\n" +
          "or re-run with --no-fetch disabled so DeployPilot can detect this earlier.",
        cause: error,
      });
    }
  }

  async pushTag(tag: string, remote = "origin"): Promise<void> {
    if (this.plan(`git push ${remote} refs/tags/${tag}`)) return;

    try {
      await this.git.raw(["push", remote, `refs/tags/${tag}`]);
    } catch (error) {
      throw new DeployPilotError(`Failed to push tag '${tag}'.`, {
        hint: `The tag may already exist on the remote. Check with:\n  git ls-remote --tags ${remote} ${tag}`,
        cause: error,
      });
    }
  }

  async resetSoft(ref = "HEAD~1"): Promise<void> {
    if (this.plan(`git reset --soft ${ref}`)) return;
    await this.git.raw(["reset", "--soft", ref]);
  }

  /** Files touched by the commits in `range`, e.g. "origin/main..HEAD". */
  async changedPaths(range: string): Promise<string[]> {
    try {
      const output = await this.git.raw(["diff", "--name-only", range]);
      return output.split("\n").map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async countCommits(range: string): Promise<number> {
    try {
      const output = await this.git.raw(["rev-list", "--count", range]);
      return Number(output.trim()) || 0;
    } catch {
      return 0;
    }
  }

  async isFirstCommit(): Promise<boolean> {
    return (await this.countCommits("HEAD")) <= 1;
  }

  async emptyCommit(message: string): Promise<string> {
    return this.commit(message, { allowEmpty: true });
  }
}
