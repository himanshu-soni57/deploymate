import type { Workflow } from "../types/workflow";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  workflow: string;
  line?: number;
  fix?: string;
}

export interface RuleContext {
  workflow: Workflow;
  /** Secret names configured on the repository, when the API was reachable. */
  knownSecrets?: string[];
  knownVariables?: string[];
}

export interface Rule {
  id: string;
  description: string;
  /** Rules needing API access are skipped when no token is available. */
  needsApi?: boolean;
  run(context: RuleContext): Finding[];
}

/** Finds the 1-based line a snippet first appears on, for clickable output. */
export function lineOf(source: string, snippet: string): number | undefined {
  const index = source.indexOf(snippet);
  if (index === -1) return undefined;
  return source.slice(0, index).split("\n").length;
}
