import type { CommitSummary } from "../types/git";
import type { ReleaseType } from "./semver";

export interface ConventionalCommit {
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
  commit: CommitSummary;
}

const HEADER = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<subject>.+)$/;

export function parseConventional(commit: CommitSummary): ConventionalCommit | null {
  const match = HEADER.exec(commit.subject);
  const groups = match?.groups;
  if (!groups?.type || !groups.subject) return null;

  const breaking =
    groups.breaking === "!" ||
    /^BREAKING[ -]CHANGE:/m.test(commit.body);

  return {
    type: groups.type.toLowerCase(),
    scope: groups.scope || null,
    breaking,
    subject: groups.subject.trim(),
    commit,
  };
}

/**
 * Derives the release type from the commits since the last tag:
 *   BREAKING CHANGE / `!` -> major
 *   feat                  -> minor
 *   anything else         -> patch
 */
export function inferReleaseType(commits: CommitSummary[]): {
  type: ReleaseType;
  reason: string;
} {
  const parsed = commits
    .map(parseConventional)
    .filter((entry): entry is ConventionalCommit => entry !== null);

  if (!parsed.length) {
    return {
      type: "patch",
      reason: "no conventional commits found since the last tag",
    };
  }

  const breaking = parsed.filter((entry) => entry.breaking);
  if (breaking.length) {
    return {
      type: "major",
      reason: `${breaking.length} breaking change${breaking.length === 1 ? "" : "s"}`,
    };
  }

  const features = parsed.filter((entry) => entry.type === "feat");
  if (features.length) {
    return {
      type: "minor",
      reason: `${features.length} feat commit${features.length === 1 ? "" : "s"}`,
    };
  }

  return {
    type: "patch",
    reason: `${parsed.length} fix/chore commit${parsed.length === 1 ? "" : "s"}`,
  };
}

const GROUP_TITLES: Record<string, string> = {
  feat: "Features",
  fix: "Bug Fixes",
  perf: "Performance",
  refactor: "Refactors",
  docs: "Documentation",
  test: "Tests",
  build: "Build",
  ci: "CI",
  chore: "Chores",
  revert: "Reverts",
  style: "Styling",
};

export interface ChangelogOptions {
  from: string | null;
  to: string;
  compareUrl?: string;
}

export function buildChangelog(
  commits: CommitSummary[],
  options: ChangelogOptions,
): string {
  if (!commits.length) return "_No changes._";

  const parsed = commits.map((commit) => ({
    commit,
    conventional: parseConventional(commit),
  }));

  const breaking = parsed.filter((entry) => entry.conventional?.breaking);
  const groups = new Map<string, typeof parsed>();
  const other: typeof parsed = [];

  for (const entry of parsed) {
    const type = entry.conventional?.type;
    if (!type || !GROUP_TITLES[type]) {
      other.push(entry);
      continue;
    }
    const bucket = groups.get(type) ?? [];
    bucket.push(entry);
    groups.set(type, bucket);
  }

  const lines: string[] = [];

  if (breaking.length) {
    lines.push("### BREAKING CHANGES", "");
    for (const entry of breaking) {
      lines.push(
        `- ${entry.conventional!.subject} (${entry.commit.shortSha})`,
      );
    }
    lines.push("");
  }

  for (const [type, title] of Object.entries(GROUP_TITLES)) {
    const bucket = groups.get(type);
    if (!bucket?.length) continue;

    lines.push(`### ${title}`, "");
    for (const entry of bucket) {
      const scope = entry.conventional!.scope
        ? `**${entry.conventional!.scope}:** `
        : "";
      lines.push(
        `- ${scope}${entry.conventional!.subject} (${entry.commit.shortSha})`,
      );
    }
    lines.push("");
  }

  if (other.length) {
    lines.push("### Other", "");
    for (const entry of other) {
      lines.push(`- ${entry.commit.subject} (${entry.commit.shortSha})`);
    }
    lines.push("");
  }

  const contributors = [...new Set(commits.map((commit) => commit.author))].sort();
  if (contributors.length) {
    lines.push(`### Contributors`, "", contributors.map((name) => `- ${name}`).join("\n"), "");
  }

  if (options.compareUrl) {
    lines.push(`**Full diff:** ${options.compareUrl}`);
  }

  return lines.join("\n").trim();
}
