import pc from "picocolors";
import { confirm } from "@clack/prompts";
import { CancelledError } from "../errors";
import { applySelection, type ChangeSelection } from "../core/selection";
import type { Context } from "../core/context";
import type { Transaction } from "../core/transaction";
import { log } from "../ui/logger";
import { createSpinner } from "../ui/spinner";
import { unwrap } from "../ui/prompt";
import { pluralize } from "../utils/format";
import type { FileChange } from "../types/git";

export interface CommitPhaseOptions {
  selection: ChangeSelection;
  changes: FileChange[];
  message: string | null;
  transaction: Transaction;
  signoff?: boolean;
}

export interface CommitPhaseResult {
  committed: boolean;
  sha: string;
}

async function confirmRisky(
  risky: string[],
  interactive: boolean,
  autoApprove: boolean,
): Promise<void> {
  if (!risky.length) return;

  log.plain();
  log.warn(
    `${pluralize(risky.length, "selected file")} look like credentials or key material:`,
  );
  for (const path of risky) log.plain(`    ${pc.red(path)}`);

  if (autoApprove) {
    log.warn("--yes was passed, committing them anyway.");
    return;
  }

  if (!interactive) {
    throw new CancelledError(
      "Refusing to commit credential-shaped files without confirmation. Re-run with --yes to override.",
    );
  }

  const proceed = unwrap(
    await confirm({
      message: "Commit these files anyway?",
      initialValue: false,
    }),
  );

  if (!proceed) throw new CancelledError("Deployment cancelled.");
}

/**
 * Stages and commits according to the selection. Returns without committing
 * when the selection is "none", which is the path for deploying work that is
 * already committed (and possibly already pushed).
 */
export async function runCommitPhase(
  context: Context,
  options: CommitPhaseOptions,
): Promise<CommitPhaseResult> {
  const { git } = context;

  if (options.selection.mode === "none") {
    const sha = await git.headSha();
    if (options.changes.length) {
      log.info(
        `Leaving ${pluralize(options.changes.length, "change")} uncommitted; deploying existing commits.`,
      );
    }
    return { committed: false, sha };
  }

  await confirmRisky(
    options.selection.risky,
    context.interactive,
    context.flags.yes === true,
  );

  if (options.selection.leftBehind.length) {
    log.warn(
      `${pluralize(options.selection.leftBehind.length, "change")} will NOT be included: ${options.selection.leftBehind
        .map((change) => change.path)
        .join(", ")}`,
    );
  }

  const spinner = createSpinner(context.interactive);

  spinner.start(
    options.selection.mode === "staged"
      ? "Using the existing index..."
      : `Staging ${pluralize(options.selection.paths.length, "file")}...`,
  );
  await applySelection(git, options.selection, options.changes, options.transaction);
  spinner.stop(`Staged ${pluralize(options.selection.paths.length, "file")}`);

  const message = options.message ?? "chore: deploy";
  const isFirst = await git.isFirstCommit();

  spinner.start("Creating commit...");
  await git.commit(message, { signoff: options.signoff });
  spinner.stop("Commit created");

  options.transaction.record("create commit", async () => {
    if (isFirst) {
      log.warn("Cannot undo the repository's first commit automatically.");
      return;
    }
    await git.resetSoft("HEAD~1");
  });

  const sha = await git.headSha();
  log.dim(`  ${sha.slice(0, 8)}  ${message.split("\n")[0]}`);

  return { committed: true, sha };
}
