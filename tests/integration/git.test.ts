import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitService } from "../../src/git/service";
import { Transaction } from "../../src/core/transaction";
import { applySelection } from "../../src/core/selection";

const run = promisify(execFile);

let repo: string;
let git: GitService;

async function sh(args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repo });
  return stdout.trim();
}

async function write(file: string, content: string): Promise<void> {
  const target = path.join(repo, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

beforeEach(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "deploypilot-"));
  await sh(["init", "--initial-branch=main"]);
  await sh(["config", "user.email", "test@example.com"]);
  await sh(["config", "user.name", "Test User"]);
  await sh(["config", "commit.gpgsign", "false"]);
  await sh(["config", "tag.gpgsign", "false"]);

  await write("README.md", "# test\n");
  await sh(["add", "."]);
  await sh(["commit", "-m", "chore: initial commit"]);

  git = new GitService({ cwd: repo });
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("GitService reads", () => {
  test("recognises the repository and its branch", async () => {
    expect(await git.isRepository()).toBe(true);
    const repository = await git.getRepository();
    expect(repository.branch).toBe("main");
    expect(repository.detached).toBe(false);
    expect(repository.headSha).toHaveLength(40);
  });

  test("reports a clean tree", async () => {
    const status = await git.getStatus();
    expect(status.clean).toBe(true);
    expect(status.files).toHaveLength(0);
  });

  test("classifies modified, added and untracked files", async () => {
    await write("README.md", "# changed\n");
    await write("new.ts", "export {};\n");
    await write("staged.ts", "export {};\n");
    await sh(["add", "staged.ts"]);

    const changes = await git.listChanges();
    const byPath = Object.fromEntries(changes.map((change) => [change.path, change]));

    expect(byPath["README.md"]!.kind).toBe("modified");
    expect(byPath["README.md"]!.staged).toBe(false);
    expect(byPath["new.ts"]!.kind).toBe("untracked");
    expect(byPath["staged.ts"]!.staged).toBe(true);
  });

  test("detects a detached HEAD", async () => {
    const sha = await git.headSha();
    await sh(["checkout", "--detach", sha]);
    expect(await git.isDetached()).toBe(true);
    expect((await git.getRepository()).branch).toBeNull();
  });

  test("lists tags and resolves refs", async () => {
    await sh(["tag", "-a", "v1.0.0", "-m", "release"]);
    expect(await git.listTags()).toContain("v1.0.0");
    expect(await git.tagExists("v1.0.0")).toBe(true);
    expect(await git.tagExists("v9.9.9")).toBe(false);
    expect(await git.refExists("v1.0.0")).toBe(true);
    expect(await git.refExists("nope")).toBe(false);
  });

  test("reads recent commits", async () => {
    await write("a.ts", "export {};\n");
    await sh(["add", "."]);
    await sh(["commit", "-m", "feat: add a"]);

    const commits = await git.recentCommits(5);
    expect(commits[0]?.subject).toBe("feat: add a");
    expect(commits).toHaveLength(2);
  });

  test("lists commits in a range for changelogs", async () => {
    await sh(["tag", "v1.0.0"]);
    await write("a.ts", "export {};\n");
    await sh(["add", "."]);
    await sh(["commit", "-m", "fix: something"]);

    const commits = await git.commitsBetween("v1.0.0");
    expect(commits.map((commit) => commit.subject)).toEqual(["fix: something"]);
  });
});

describe("GitService mutations", () => {
  test("stages only the paths it is given", async () => {
    await write("a.ts", "export {};\n");
    await write("b.ts", "export {};\n");

    await git.stagePaths(["a.ts"]);

    expect(await git.getStagedPaths()).toEqual(["a.ts"]);
  });

  test("unstages paths again", async () => {
    await write("a.ts", "export {};\n");
    await git.stagePaths(["a.ts"]);
    await git.unstagePaths(["a.ts"]);

    expect(await git.getStagedPaths()).toEqual([]);
  });

  test("creates an annotated tag carrying its message", async () => {
    await git.createTag("v2.0.0", { message: "v2.0.0\n\nthe changelog" });

    const type = await sh(["cat-file", "-t", "v2.0.0"]);
    expect(type).toBe("tag");
    expect(await sh(["tag", "-l", "--format=%(contents)", "v2.0.0"])).toContain(
      "the changelog",
    );
  });

  test("keeps markdown headings in the tag message", async () => {
    // git tag defaults to --cleanup=strip, which would delete every '#' line
    // and gut the generated changelog.
    await git.createTag("v3.0.0", {
      message: "v3.0.0\n\n### Features\n\n- a thing (abc1234)",
    });

    const contents = await sh(["tag", "-l", "--format=%(contents)", "v3.0.0"]);
    expect(contents).toContain("### Features");
  });

  test("tags a specific commit rather than HEAD", async () => {
    const first = await git.headSha();
    await write("a.ts", "export {};\n");
    await sh(["add", "."]);
    await sh(["commit", "-m", "second"]);

    await git.createTag("v1.0.0", { ref: first, message: "old" });

    expect(await sh(["rev-list", "-n1", "v1.0.0"])).toBe(first);
  });

  test("deletes a local tag", async () => {
    await git.createTag("temp", { message: "temp" });
    await git.deleteLocalTag("temp");
    expect(await git.tagExists("temp")).toBe(false);
  });

  test("resetSoft undoes a commit but keeps the changes staged", async () => {
    await write("a.ts", "export {};\n");
    await git.stagePaths(["a.ts"]);
    await git.commit("feat: a");

    expect((await git.recentCommits(1))[0]?.subject).toBe("feat: a");

    await git.resetSoft("HEAD~1");

    expect((await git.recentCommits(1))[0]?.subject).toBe("chore: initial commit");
    expect(await git.getStagedPaths()).toEqual(["a.ts"]);
  });

  test("countCommits and isFirstCommit", async () => {
    expect(await git.countCommits("HEAD")).toBe(1);
    expect(await git.isFirstCommit()).toBe(true);
  });
});

describe("dry run", () => {
  test("performs no mutation", async () => {
    const dry = new GitService({ cwd: repo, dryRun: true });
    await write("a.ts", "export {};\n");

    await dry.stagePaths(["a.ts"]);
    await dry.commit("feat: nope");
    await dry.createTag("v9.9.9", { message: "nope" });

    expect(await git.getStagedPaths()).toEqual([]);
    expect(await git.tagExists("v9.9.9")).toBe(false);
    expect(await git.countCommits("HEAD")).toBe(1);
  });
});

describe("applySelection", () => {
  test("commits only the selected file, leaving the rest uncommitted", async () => {
    await write("keep.ts", "export {};\n");
    await write("later.ts", "export {};\n");

    const changes = await git.listChanges();
    const transaction = new Transaction();

    await applySelection(
      git,
      { mode: "paths", paths: ["keep.ts"], leftBehind: [], risky: [] },
      changes,
      transaction,
    );
    await git.commit("feat: keep only");

    const committed = await sh(["show", "--name-only", "--pretty=format:", "HEAD"]);
    expect(committed).toContain("keep.ts");
    expect(committed).not.toContain("later.ts");

    const remaining = await git.listChanges();
    expect(remaining.map((change) => change.path)).toEqual(["later.ts"]);
  });

  test("unstages files the user did not select, so they are not swept in", async () => {
    await write("wanted.ts", "export {};\n");
    await write("unwanted.ts", "export {};\n");
    await sh(["add", "unwanted.ts"]);

    const changes = await git.listChanges();

    await applySelection(
      git,
      { mode: "paths", paths: ["wanted.ts"], leftBehind: [], risky: [] },
      changes,
      new Transaction(),
    );

    expect(await git.getStagedPaths()).toEqual(["wanted.ts"]);

    await git.commit("feat: wanted");
    const committed = await sh(["show", "--name-only", "--pretty=format:", "HEAD"]);
    expect(committed).not.toContain("unwanted.ts");
  });

  test("mode 'none' stages nothing at all", async () => {
    await write("a.ts", "export {};\n");

    await applySelection(
      git,
      { mode: "none", paths: [], leftBehind: [], risky: [] },
      await git.listChanges(),
      new Transaction(),
    );

    expect(await git.getStagedPaths()).toEqual([]);
  });

  test("rollback restores the pre-selection index", async () => {
    await write("a.ts", "export {};\n");
    const transaction = new Transaction();

    await applySelection(
      git,
      { mode: "paths", paths: ["a.ts"], leftBehind: [], risky: [] },
      await git.listChanges(),
      transaction,
    );
    expect(await git.getStagedPaths()).toEqual(["a.ts"]);

    await transaction.rollback();
    expect(await git.getStagedPaths()).toEqual([]);
  });
});

describe("Transaction", () => {
  test("undoes in reverse order and survives a failing step", async () => {
    const order: string[] = [];
    const transaction = new Transaction();

    transaction.record("first", async () => {
      order.push("first");
    });
    transaction.record("boom", async () => {
      throw new Error("cannot undo");
    });
    transaction.record("last", async () => {
      order.push("last");
    });

    const result = await transaction.rollback();

    expect(order).toEqual(["last", "first"]);
    expect(result.failed).toEqual(["boom"]);
    expect(transaction.isEmpty).toBe(true);
  });

  test("seal discards every pending undo", async () => {
    const transaction = new Transaction();
    let undone = false;
    transaction.record("x", async () => {
      undone = true;
    });

    transaction.seal();
    await transaction.rollback();

    expect(undone).toBe(false);
  });
});
