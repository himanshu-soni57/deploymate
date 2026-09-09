import { DeployPilotError } from "../errors";
import type { GitService } from "../git/service";
import type { FileChange } from "../types/git";
import { matchesAnyGlob, matchesGlob } from "../utils/glob";
import { log } from "../ui/logger";
import type { Transaction } from "./transaction";

export type SelectionMode =
  /** Commit every change in the working tree. */
  | "all"
  /** Commit only the paths the user picked. */
  | "paths"
  /** Commit exactly what is already in the index. */
  | "staged"
  /** Commit nothing; deploy commits that already exist. */
  | "none";

export interface ChangeSelection {
  mode: SelectionMode;
  /** Paths that will be committed. Empty for "none". */
  paths: string[];
  /** Changes that will be left in the working tree, uncommitted. */
  leftBehind: FileChange[];
  /** Protected-looking paths inside the selection. */
  risky: string[];
}

export function describeKind(change: FileChange): string {
  switch (change.kind) {
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return `renamed from ${change.from ?? "?"}`;
    case "untracked":
      return "untracked";
    case "conflicted":
      return "CONFLICT";
    case "typechange":
      return "type changed";
    default:
      return change.staged && !change.unstaged ? "staged" : "modified";
  }
}

export function findRiskyPaths(paths: string[], patterns: string[]): string[] {
  return paths.filter((file) => matchesAnyGlob(file, patterns));
}

/**
 * Builds a selection from explicit flags, without prompting. Returns null when
 * no staging flag was supplied and the caller should ask instead.
 */
export function selectionFromFlags(
  changes: FileChange[],
  flags: {
    all?: boolean;
    staged?: boolean;
    noCommit?: boolean;
    file?: string[];
  },
  protectedPaths: string[],
): ChangeSelection | null {
  const chosen = [flags.all, flags.staged, flags.noCommit, flags.file?.length]
    .filter(Boolean).length;

  if (chosen > 1) {
    throw new DeployPilotError(
      "Pick one staging mode: --all, --staged, --file, or --no-commit.",
    );
  }

  if (flags.noCommit) {
    return {
      mode: "none",
      paths: [],
      leftBehind: changes,
      risky: [],
    };
  }

  if (flags.all) {
    const paths = changes.map((change) => change.path);
    return {
      mode: "all",
      paths,
      leftBehind: [],
      risky: findRiskyPaths(paths, protectedPaths),
    };
  }

  if (flags.staged) {
    const staged = changes.filter((change) => change.staged);
    if (!staged.length) {
      throw new DeployPilotError("--staged was given but the index is empty.", {
        hint: "Stage something with `git add <path>` first, or use --all / --file.",
      });
    }
    const paths = staged.map((change) => change.path);
    return {
      mode: "staged",
      paths,
      leftBehind: changes.filter((change) => !change.staged),
      risky: findRiskyPaths(paths, protectedPaths),
    };
  }

  if (flags.file?.length) {
    const known = new Set(changes.map((change) => change.path));
    const matched = new Set<string>();

    for (const pattern of flags.file) {
      if (known.has(pattern)) {
        matched.add(pattern);
        continue;
      }
      const globbed = [...known].filter((file) => matchesGlob(file, pattern));
      if (!globbed.length) {
        throw new DeployPilotError(
          `--file '${pattern}' matched none of the changed files.`,
          {
            hint: `Changed files:\n${[...known].map((file) => `  ${file}`).join("\n")}`,
          },
        );
      }
      for (const file of globbed) matched.add(file);
    }

    const paths = [...matched];
    return {
      mode: "paths",
      paths,
      leftBehind: changes.filter((change) => !matched.has(change.path)),
      risky: findRiskyPaths(paths, protectedPaths),
    };
  }

  return null;
}

/**
 * Stages exactly what the selection describes.
 *
 * When the user picks a subset while other files are already staged, those
 * pre-staged files are removed from the index first. Without that step
 * `git commit` would sweep them in, silently deploying files the user
 * explicitly did not choose.
 */
export async function applySelection(
  git: GitService,
  selection: ChangeSelection,
  changes: FileChange[],
  transaction: Transaction,
): Promise<void> {
  if (selection.mode === "none") return;

  if (selection.mode === "staged") return;

  if (selection.mode === "all") {
    const previouslyStaged = changes
      .filter((change) => change.staged)
      .map((change) => change.path);

    await git.stageAll();
    transaction.record("stage all changes", async () => {
      const nowStaged = await git.getStagedPaths();
      const added = nowStaged.filter((path) => !previouslyStaged.includes(path));
      await git.unstagePaths(added);
    });
    return;
  }

  const selected = new Set(selection.paths);
  const strays = changes
    .filter((change) => change.staged && !selected.has(change.path))
    .map((change) => change.path);

  if (strays.length) {
    log.warn(
      `Unstaging ${strays.length} file(s) that were staged but not selected: ${strays.join(", ")}`,
    );
    await git.unstagePaths(strays);
    transaction.record("unstage unselected files", () => git.stagePaths(strays));
  }

  await git.stagePaths(selection.paths);
  transaction.record("stage selected files", () =>
    git.unstagePaths(selection.paths),
  );
}
