import { RULES } from "./rules";
import type { Finding, RuleContext } from "./types";
import type { Workflow } from "../types/workflow";

export interface DoctorOptions {
  knownSecrets?: string[];
  knownVariables?: string[];
  /** Only run these rule ids. */
  only?: string[];
  /** Skip these rule ids. */
  skip?: string[];
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function audit(
  workflows: Workflow[],
  options: DoctorOptions = {},
): Finding[] {
  const findings: Finding[] = [];

  for (const workflow of workflows) {
    const context: RuleContext = {
      workflow,
      knownSecrets: options.knownSecrets,
      knownVariables: options.knownVariables,
    };

    for (const rule of RULES) {
      if (options.only?.length && !options.only.includes(rule.id)) continue;
      if (options.skip?.includes(rule.id)) continue;
      if (rule.needsApi && !options.knownSecrets) continue;

      try {
        findings.push(...rule.run(context));
      } catch {
        // A rule that throws must not take the whole audit down.
      }
    }
  }

  return findings.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.workflow.localeCompare(b.workflow);
  });
}

export function summarize(findings: Finding[]): Record<Finding["severity"], number> {
  return {
    error: findings.filter((entry) => entry.severity === "error").length,
    warning: findings.filter((entry) => entry.severity === "warning").length,
    info: findings.filter((entry) => entry.severity === "info").length,
  };
}
