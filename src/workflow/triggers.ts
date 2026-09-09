import { matchesAnyGlob } from "../utils/glob";
import type { PushTrigger } from "../types/workflow";

export interface TriggerVerdict {
  triggers: boolean;
  reason: string;
}

/**
 * GitHub's rule: an empty `branches`/`tags` list means "any ref"; an
 * `-ignore` match always wins over an inclusion match.
 */
export function refMatches(
  ref: string,
  include: string[] | undefined,
  ignore: string[] | undefined,
): boolean {
  if (ignore?.length && matchesAnyGlob(ref, ignore)) return false;
  if (!include?.length) return true;
  return matchesAnyGlob(ref, include);
}

export function pathsMatch(
  changed: string[],
  include: string[] | undefined,
  ignore: string[] | undefined,
): boolean {
  if (!include?.length && !ignore?.length) return true;
  if (!changed.length) return false;

  const surviving = ignore?.length
    ? changed.filter((file) => !matchesAnyGlob(file, ignore))
    : changed;

  if (!surviving.length) return false;
  if (!include?.length) return true;

  return surviving.some((file) => matchesAnyGlob(file, include));
}

/**
 * Answers the question the old planner never asked: will pushing these files
 * to this branch actually start the workflow?
 */
export function evaluateBranchPush(
  trigger: PushTrigger,
  branch: string,
  changedPaths: string[],
): TriggerVerdict {
  if (trigger["branches-ignore"]?.length) {
    if (matchesAnyGlob(branch, trigger["branches-ignore"])) {
      return {
        triggers: false,
        reason: `branch '${branch}' is excluded by branches-ignore`,
      };
    }
  }

  if (trigger.branches?.length && !matchesAnyGlob(branch, trigger.branches)) {
    return {
      triggers: false,
      reason: `branch '${branch}' does not match branches: [${trigger.branches.join(", ")}]`,
    };
  }

  if (!pathsMatch(changedPaths, trigger.paths, trigger["paths-ignore"])) {
    const filter = trigger.paths?.length
      ? `paths: [${trigger.paths.join(", ")}]`
      : `paths-ignore: [${trigger["paths-ignore"]?.join(", ")}]`;
    return {
      triggers: false,
      reason: `no changed file matches ${filter}`,
    };
  }

  return { triggers: true, reason: `push to '${branch}' matches the trigger` };
}

export function evaluateTagPush(
  trigger: PushTrigger,
  tag: string,
): TriggerVerdict {
  if (trigger["tags-ignore"]?.length && matchesAnyGlob(tag, trigger["tags-ignore"])) {
    return { triggers: false, reason: `tag '${tag}' is excluded by tags-ignore` };
  }

  if (trigger.tags?.length && !matchesAnyGlob(tag, trigger.tags)) {
    return {
      triggers: false,
      reason: `tag '${tag}' does not match tags: [${trigger.tags.join(", ")}]`,
    };
  }

  return { triggers: true, reason: `tag '${tag}' matches the trigger` };
}
