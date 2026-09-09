import { globLiterals, globToRegExp } from "../utils/glob";
import {
  bump,
  compareSemver,
  formatSemver,
  maxSemver,
  parseSemver,
  type ReleaseType,
  type Semver,
} from "./semver";

export type VersionScheme = "semver" | "calver" | "timestamp" | "literal";

export interface PatternAnalysis {
  pattern: string;
  regex: RegExp;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  scheme: VersionScheme;
  /** Existing tags that satisfy the pattern, newest-first by version order. */
  matching: string[];
  latest: string | null;
  latestSemver: Semver | null;
}

export interface TagSuggestion {
  tag: string;
  label: string;
  hint: string;
}

/** Shapes that unambiguously mean semver, e.g. `v*.*.*` or `[0-9]*.[0-9]*.[0-9]*`. */
const SEMVER_SHAPE = /(\*|\[[^\]]*\]\*?|\?)\.(\*|\[[^\]]*\]\*?|\?)\.(\*|\[[^\]]*\]\*?|\?)/;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

export function analyzePattern(
  pattern: string,
  existingTags: string[] = [],
  now: Date = new Date(),
): PatternAnalysis {
  const regex = globToRegExp(pattern);
  const { prefix, suffix, hasWildcard } = globLiterals(pattern);

  const matching = existingTags.filter((tag) => regex.test(tag));

  const semvers = matching
    .map((tag) => ({ tag, version: parseSemver(stripAffixes(tag, prefix, suffix)) }))
    .filter((entry): entry is { tag: string; version: Semver } => entry.version !== null);

  const latestSemver = maxSemver(semvers.map((entry) => entry.version));
  const latest =
    semvers
      .slice()
      .sort((a, b) => compareSemver(b.version, a.version))[0]?.tag ??
    matching[0] ??
    null;

  let scheme: VersionScheme;

  if (!hasWildcard) {
    scheme = "literal";
  } else if (SEMVER_SHAPE.test(pattern.slice(prefix.length))) {
    scheme = "semver";
  } else if (semvers.length && semvers.length * 2 >= matching.length) {
    // History says this prefix is used for semver even though the pattern
    // itself (e.g. `prod-v*`) does not spell it out.
    scheme = "semver";
  } else {
    scheme = "timestamp";
  }

  void now;

  return {
    pattern,
    regex,
    prefix,
    suffix,
    hasWildcard,
    scheme,
    matching,
    latest,
    latestSemver,
  };
}

function stripAffixes(tag: string, prefix: string, suffix: string): string {
  let value = tag;
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length);
  if (suffix && value.endsWith(suffix)) {
    value = value.slice(0, value.length - suffix.length);
  }
  return value;
}

function compose(analysis: PatternAnalysis, body: string): string {
  return `${analysis.prefix}${body}${analysis.suffix}`;
}

function timestampBody(now: Date): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function calverBody(analysis: PatternAnalysis, now: Date): string {
  const stem = `${now.getFullYear()}.${pad(now.getMonth() + 1)}`;
  let sequence = 1;

  for (const tag of analysis.matching) {
    const body = stripAffixes(tag, analysis.prefix, analysis.suffix);
    const match = new RegExp(`^${stem.replace(/\./g, "\\.")}\\.(\\d+)$`).exec(body);
    if (match) sequence = Math.max(sequence, Number(match[1]) + 1);
  }

  return `${stem}.${sequence}`;
}

/**
 * Builds candidate tags for a pattern and DISCARDS any that the pattern would
 * not actually match. This is the fix for the old generator, which happily
 * produced `v20260908-141530` for `v*.*.*` -- a tag that never triggers the
 * workflow it was generated for.
 */
export function suggestTags(
  analysis: PatternAnalysis,
  options: {
    now?: Date;
    preid?: string;
    inferred?: { type: ReleaseType; reason: string } | null;
  } = {},
): TagSuggestion[] {
  const now = options.now ?? new Date();
  const suggestions: TagSuggestion[] = [];

  if (analysis.scheme === "literal") {
    return [
      {
        tag: analysis.pattern,
        label: analysis.pattern,
        hint: "the pattern is a fixed tag name",
      },
    ];
  }

  if (analysis.scheme === "semver") {
    const base = analysis.latestSemver ?? {
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: [],
      build: null,
    };
    const from = analysis.latestSemver
      ? `from ${formatSemver(analysis.latestSemver)}`
      : "first release";

    const types: ReleaseType[] = ["patch", "minor", "major", "prerelease"];

    for (const type of types) {
      const next = analysis.latestSemver
        ? bump(base, type, options.preid)
        : type === "major"
          ? { ...base, major: 1 }
          : type === "minor"
            ? { ...base, minor: 1 }
            : type === "prerelease"
              ? { ...base, patch: 1, prerelease: [options.preid ?? "rc", "0"] }
              : { ...base, patch: 1 };

      const recommended =
        options.inferred?.type === type ? " (recommended)" : "";

      suggestions.push({
        tag: compose(analysis, formatSemver(next)),
        label: `${type}${recommended}`,
        hint:
          options.inferred?.type === type
            ? `${from} - ${options.inferred.reason}`
            : from,
      });
    }
  }

  suggestions.push({
    tag: compose(analysis, timestampBody(now)),
    label: "timestamp",
    hint: "date + time, always unique",
  });

  suggestions.push({
    tag: compose(analysis, calverBody(analysis, now)),
    label: "calver",
    hint: "year.month.sequence",
  });

  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.tag)) return false;
    seen.add(suggestion.tag);
    // A suggestion that does not satisfy the workflow's own filter is worse
    // than useless: it would push a tag that triggers nothing.
    return analysis.regex.test(suggestion.tag);
  });
}

export function validateTagAgainstPattern(
  tag: string,
  pattern: string,
): { valid: boolean; message?: string } {
  if (!tag.trim()) return { valid: false, message: "Tag is required." };

  if (/\s/.test(tag)) {
    return { valid: false, message: "Git tags cannot contain whitespace." };
  }

  if (/[~^:?*[\\]/.test(tag) || tag.includes("..") || tag.endsWith(".lock")) {
    return { valid: false, message: `'${tag}' is not a valid git ref name.` };
  }

  if (!globToRegExp(pattern).test(tag)) {
    return {
      valid: false,
      message: `'${tag}' does not match the workflow's filter '${pattern}', so it would not trigger anything.`,
    };
  }

  return { valid: true };
}
