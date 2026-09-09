import { multiselect, select } from "@clack/prompts";
import pc from "picocolors";
import { unwrap } from "../ui/prompt";
import { log } from "../ui/logger";
import { pluralize } from "../utils/format";
import {
  describeKind,
  findRiskyPaths,
  type ChangeSelection,
  type SelectionMode,
} from "../core/selection";
import type { FileChange } from "../types/git";

const KIND_COLOR: Record<string, (value: string) => string> = {
  added: pc.green,
  untracked: pc.green,
  modified: pc.yellow,
  typechange: pc.yellow,
  renamed: pc.cyan,
  deleted: pc.red,
  conflicted: pc.red,
};

function label(change: FileChange): string {
  const color = KIND_COLOR[change.kind] ?? pc.white;
  const marker = change.staged ? pc.dim("[staged] ") : "";
  return `${marker}${color(change.path)}`;
}

export function renderChanges(changes: FileChange[]): void {
  log.heading(`Working tree (${pluralize(changes.length, "change")})`);
  for (const change of changes) {
    log.plain(`  ${label(change)} ${pc.dim(describeKind(change))}`);
  }
}

/**
 * Asks how much of the working tree should go into this deployment.
 *
 * "Deploy existing commits" is always offered, including when the tree is
 * dirty: tagging or dispatching against work that is already committed and
 * pushed is a first-class flow, not an edge case.
 */
export async function askSelectionMode(
  changes: FileChange[],
  interactive: boolean,
): Promise<SelectionMode> {
  if (!changes.length) return "none";

  if (!interactive) return "none";

  const staged = changes.filter((change) => change.staged);

  const options: { value: SelectionMode; label: string; hint: string }[] = [
    {
      value: "all",
      label: "Commit all changes",
      hint: pluralize(changes.length, "file"),
    },
    {
      value: "paths",
      label: "Pick specific files to commit",
      hint: "choose from the list",
    },
  ];

  if (staged.length) {
    options.push({
      value: "staged",
      label: "Commit only what is already staged",
      hint: pluralize(staged.length, "file"),
    });
  }

  options.push({
    value: "none",
    label: "Deploy existing commits only",
    hint: "leave the working tree untouched",
  });

  return unwrap(
    await select({
      message: "What should this deployment include?",
      options,
    }),
  );
}

export async function pickFiles(changes: FileChange[]): Promise<string[]> {
  const initial = changes
    .filter((change) => change.staged)
    .map((change) => change.path);

  return unwrap(
    await multiselect({
      message: `Select files to commit ${pc.dim("(space to toggle, enter to confirm)")}`,
      required: true,
      initialValues: initial.length ? initial : undefined,
      options: changes.map((change) => ({
        value: change.path,
        label: label(change),
        hint: describeKind(change),
      })),
    }),
  );
}

export async function buildInteractiveSelection(
  changes: FileChange[],
  protectedPaths: string[],
  interactive: boolean,
): Promise<ChangeSelection> {
  const mode = await askSelectionMode(changes, interactive);

  if (mode === "none") {
    return { mode, paths: [], leftBehind: changes, risky: [] };
  }

  if (mode === "all") {
    const paths = changes.map((change) => change.path);
    return {
      mode,
      paths,
      leftBehind: [],
      risky: findRiskyPaths(paths, protectedPaths),
    };
  }

  if (mode === "staged") {
    const staged = changes.filter((change) => change.staged);
    const paths = staged.map((change) => change.path);
    return {
      mode,
      paths,
      leftBehind: changes.filter((change) => !change.staged),
      risky: findRiskyPaths(paths, protectedPaths),
    };
  }

  const picked = await pickFiles(changes);
  const selected = new Set(picked);

  return {
    mode: "paths",
    paths: picked,
    leftBehind: changes.filter((change) => !selected.has(change.path)),
    risky: findRiskyPaths(picked, protectedPaths),
  };
}
