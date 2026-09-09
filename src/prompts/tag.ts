import { select, text } from "@clack/prompts";
import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import {
  analyzePattern,
  suggestTags,
  validateTagAgainstPattern,
  type PatternAnalysis,
} from "../versioning";
import type { ReleaseType } from "../versioning";

export interface TagChoiceOptions {
  patterns: string[];
  existingTags: string[];
  interactive: boolean;
  explicitTag?: string;
  bump?: ReleaseType | "auto";
  inferred?: { type: ReleaseType; reason: string } | null;
}

export interface TagChoice {
  tag: string;
  pattern: string;
  analysis: PatternAnalysis;
}

async function choosePattern(
  patterns: string[],
  interactive: boolean,
): Promise<string> {
  if (patterns.length === 1) return patterns[0]!;

  if (!interactive) return patterns[0]!;

  return unwrap(
    await select({
      message: "This workflow watches several tag patterns. Which one?",
      options: patterns.map((pattern) => ({ value: pattern, label: pattern })),
    }),
  );
}

export async function chooseTag(options: TagChoiceOptions): Promise<TagChoice> {
  const pattern = await choosePattern(options.patterns, options.interactive);
  const analysis = analyzePattern(pattern, options.existingTags);

  if (options.explicitTag) {
    const verdict = validateTagAgainstPattern(options.explicitTag, pattern);
    if (!verdict.valid) {
      throw new DeployPilotError(verdict.message!, {
        hint: "Pass a tag that matches the workflow filter, or --force to override the check.",
      });
    }
    return { tag: options.explicitTag, pattern, analysis };
  }

  const suggestions = suggestTags(analysis, { inferred: options.inferred });

  if (!suggestions.length) {
    if (!options.interactive) {
      throw new DeployPilotError(
        `Could not generate a tag matching '${pattern}'.`,
        { hint: "Pass one explicitly with --tag <name>." },
      );
    }
    return { tag: await askCustomTag(pattern), pattern, analysis };
  }

  if (options.bump && options.bump !== "auto") {
    const match = suggestions.find((entry) => entry.label.startsWith(options.bump!));
    if (!match) {
      throw new DeployPilotError(
        `Cannot apply --bump ${options.bump} to pattern '${pattern}'.`,
        {
          hint:
            analysis.scheme === "semver"
              ? "Unexpected: the pattern is semver but no candidate was produced."
              : `'${pattern}' is not a semver pattern (detected: ${analysis.scheme}). Use --tag instead.`,
        },
      );
    }
    return { tag: match.tag, pattern, analysis };
  }

  if (options.bump === "auto") {
    const recommended =
      suggestions.find((entry) => entry.label.includes("(recommended)")) ??
      suggestions[0]!;
    return { tag: recommended.tag, pattern, analysis };
  }

  if (!options.interactive) {
    const recommended =
      suggestions.find((entry) => entry.label.includes("(recommended)")) ??
      suggestions[0]!;
    return { tag: recommended.tag, pattern, analysis };
  }

  const chosen = unwrap(
    await select({
      message: analysis.latest
        ? `Next tag ${pc.dim(`(latest: ${analysis.latest})`)}`
        : `Next tag ${pc.dim(`(no existing tag matches '${pattern}')`)}`,
      options: [
        ...suggestions.map((entry) => ({
          value: entry.tag,
          label: `${entry.tag}  ${pc.dim(entry.label)}`,
          hint: entry.hint,
        })),
        { value: "__custom__", label: "Enter a custom tag", hint: pattern },
      ],
    }),
  );

  if (chosen === "__custom__") {
    return { tag: await askCustomTag(pattern), pattern, analysis };
  }

  return { tag: chosen, pattern, analysis };
}

export async function askCustomTag(pattern: string): Promise<string> {
  return unwrap(
    await text({
      message: `Tag name ${pc.dim(`(must match ${pattern})`)}`,
      validate: (value = "") => validateTagAgainstPattern(value, pattern).message,
    }),
  ).trim();
}
