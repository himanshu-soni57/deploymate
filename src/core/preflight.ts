import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";
import { pluralize } from "../utils/format";
import type { Context } from "./context";

export type CheckLevel = "ok" | "warn" | "error";

export interface Check {
  level: CheckLevel;
  label: string;
  detail?: string;
  hint?: string;
}

export interface PreflightOptions {
  /** Skip the network round-trip. */
  fetch?: boolean;
  /** Branch the deployment targets, when known. */
  requireBranch?: string;
  /** Refuse to continue with a dirty working tree. */
  requireClean?: boolean;
  /** Deploying an existing commit does not need a writable working tree. */
  needsWorkingTree?: boolean;
  /** Downgrade errors to warnings. */
  force?: boolean;
}

const ICONS: Record<CheckLevel, string> = {
  ok: pc.green("ok  "),
  warn: pc.yellow("warn"),
  error: pc.red("fail"),
};

export async function runPreflight(
  context: Context,
  options: PreflightOptions = {},
): Promise<Check[]> {
  const checks: Check[] = [];
  const { git } = context;

  checks.push({
    level: "ok",
    label: "Git repository",
    detail: context.repository.root,
  });

  if (!(await git.hasCommits())) {
    checks.push({
      level: "error",
      label: "Repository has no commits",
      hint: "Make an initial commit before deploying.",
    });
    return report(checks, options);
  }

  const remotes = context.repository.remotes.map((remote) => remote.name);
  if (!remotes.includes(context.remote)) {
    checks.push({
      level: "error",
      label: `Remote '${context.remote}' not found`,
      detail: remotes.length ? `available: ${remotes.join(", ")}` : "no remotes configured",
      hint: `git remote add ${context.remote} git@github.com:owner/repo.git`,
    });
    return report(checks, options);
  }

  const remoteUrl = await git.getRemoteUrl(context.remote);
  checks.push({
    level: "ok",
    label: `Remote '${context.remote}'`,
    detail: remoteUrl ?? undefined,
  });

  if (context.repository.detached) {
    checks.push({
      level: options.needsWorkingTree === false ? "warn" : "error",
      label: "HEAD is detached",
      detail: context.repository.headSha.slice(0, 8),
      hint: "Check out a branch with `git switch <branch>` before deploying.",
    });
  } else {
    checks.push({
      level: "ok",
      label: "Current branch",
      detail: context.repository.branch ?? undefined,
    });
  }

  const branch = context.repository.branch;

  if (branch && options.requireBranch && branch !== options.requireBranch) {
    checks.push({
      level: "error",
      label: `Expected branch '${options.requireBranch}'`,
      detail: `currently on '${branch}'`,
      hint: `git switch ${options.requireBranch}`,
    });
  }

  if (options.fetch !== false && branch) {
    try {
      await git.fetch(context.remote);
      checks.push({ level: "ok", label: "Fetched remote refs" });
    } catch (error) {
      checks.push({
        level: "warn",
        label: "Could not fetch from remote",
        detail: error instanceof Error ? error.message.split("\n")[0] : undefined,
        hint: "Working offline? Re-run with --no-fetch to skip this check.",
      });
    }
  }

  if (branch) {
    const upstream = await git.getUpstream(branch);

    if (!upstream) {
      checks.push({
        level: "warn",
        label: "Branch has no upstream",
        detail: `will push with --set-upstream to ${context.remote}/${branch}`,
      });
    } else {
      const { ahead, behind } = await git.aheadBehind(branch);

      if (behind > 0) {
        checks.push({
          level: "error",
          label: `Branch is ${pluralize(behind, "commit")} behind ${upstream}`,
          hint:
            "Pushing would be rejected. Integrate the remote work first:\n" +
            "  git pull --rebase",
        });
      } else {
        checks.push({
          level: "ok",
          label: `In sync with ${upstream}`,
          detail: ahead > 0 ? `${pluralize(ahead, "commit")} ahead` : "up to date",
        });
      }
    }
  }

  const status = await git.getStatus();

  if (options.requireClean && !status.clean) {
    checks.push({
      level: "error",
      label: "Working tree is not clean",
      detail: pluralize(status.files.length, "changed file"),
      hint: "This environment sets requireClean. Commit or stash your changes first.",
    });
  } else {
    checks.push({
      level: "ok",
      label: "Working tree",
      detail: status.clean
        ? "clean"
        : pluralize(status.files.length, "changed file"),
    });
  }

  const conflicted = status.files.filter((file) => file.kind === "conflicted");
  if (conflicted.length) {
    checks.push({
      level: "error",
      label: "Unresolved merge conflicts",
      detail: conflicted.map((file) => file.path).join(", "),
      hint: "Resolve the conflicts and `git add` the files before deploying.",
    });
  }

  return report(checks, options);
}

export function renderChecks(checks: Check[]): void {
  log.heading("Preflight");
  for (const check of checks) {
    const detail = check.detail ? pc.dim(` (${check.detail})`) : "";
    log.plain(`  ${ICONS[check.level]}  ${check.label}${detail}`);
  }
}

function report(checks: Check[], options: PreflightOptions): Check[] {
  renderChecks(checks);

  const failures = checks.filter((check) => check.level === "error");

  if (!failures.length) return checks;

  if (options.force) {
    log.plain();
    log.warn(`--force: continuing past ${pluralize(failures.length, "failed check")}.`);
    return checks;
  }

  const first = failures[0]!;
  throw new DeployPilotError(
    failures.length === 1
      ? `Preflight failed: ${first.label}`
      : `Preflight failed: ${first.label} (and ${failures.length - 1} more)`,
    {
      hint:
        failures
          .map((check) => check.hint)
          .filter(Boolean)
          .join("\n\n") || "Re-run with --force to override.",
    },
  );
}
