import YAML from "yaml";
import type { Finding } from "../audit/types";

export interface LintResult {
  file: string;
  findings: Finding[];
}

const KNOWN_EVENTS = new Set([
  "branch_protection_rule", "check_run", "check_suite", "create", "delete",
  "deployment", "deployment_status", "discussion", "discussion_comment",
  "fork", "gollum", "issue_comment", "issues", "label", "merge_group",
  "milestone", "page_build", "public", "pull_request", "pull_request_review",
  "pull_request_review_comment", "pull_request_target", "push",
  "registry_package", "release", "repository_dispatch", "schedule", "status",
  "watch", "workflow_call", "workflow_dispatch", "workflow_run",
]);

const TOP_LEVEL = new Set([
  "name", "on", "true", "permissions", "env", "defaults", "concurrency",
  "jobs", "run-name",
]);

const JOB_KEYS = new Set([
  "name", "permissions", "needs", "if", "runs-on", "environment", "concurrency",
  "outputs", "env", "defaults", "steps", "timeout-minutes", "strategy",
  "continue-on-error", "container", "services", "uses", "with", "secrets",
]);

function finding(
  file: string,
  severity: Finding["severity"],
  rule: string,
  message: string,
  line?: number,
  fix?: string,
): Finding {
  return { workflow: file, severity, rule, message, line, fix };
}

/**
 * Structural validation of a workflow file, reported with line numbers so the
 * error is fixable without a push-and-wait cycle.
 */
export function lintWorkflowSource(source: string, file: string): Finding[] {
  const findings: Finding[] = [];

  let document: YAML.Document.Parsed;
  try {
    document = YAML.parseDocument(source, { keepSourceTokens: true });
  } catch (error) {
    return [
      finding(
        file,
        "error",
        "yaml-parse",
        error instanceof Error ? error.message : "Could not parse YAML.",
      ),
    ];
  }

  for (const error of document.errors) {
    findings.push(
      finding(
        file,
        "error",
        "yaml-parse",
        error.message,
        lineFromOffset(source, error.pos?.[0] ?? 0),
      ),
    );
  }

  if (findings.length) return findings;

  const value = document.toJS() as Record<string, unknown> | null;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [
      finding(file, "error", "invalid-root", "The workflow root must be a mapping."),
    ];
  }

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL.has(key)) {
      findings.push(
        finding(
          file,
          "warning",
          "unknown-key",
          `Unknown top-level key '${key}'. GitHub ignores it silently.`,
          lineOfKey(source, key),
        ),
      );
    }
  }

  const triggers = "on" in value ? value.on : value.true;

  if (triggers === undefined) {
    findings.push(
      finding(file, "error", "missing-on", "Missing required `on:` block.", undefined,
        "on:\n  workflow_dispatch:"),
    );
  } else {
    const events =
      typeof triggers === "string"
        ? [triggers]
        : Array.isArray(triggers)
          ? triggers.map(String)
          : Object.keys(triggers as object);

    for (const event of events) {
      if (!KNOWN_EVENTS.has(event)) {
        findings.push(
          finding(
            file,
            "error",
            "unknown-event",
            `'${event}' is not a GitHub Actions event. This workflow will never trigger on it.`,
            lineOfKey(source, event),
            suggestEvent(event),
          ),
        );
      }
    }
  }

  const jobs = value.jobs as Record<string, Record<string, unknown>> | undefined;

  if (!jobs || typeof jobs !== "object") {
    findings.push(
      finding(file, "error", "missing-jobs", "Missing required `jobs:` block."),
    );
    return findings;
  }

  if (!Object.keys(jobs).length) {
    findings.push(finding(file, "error", "empty-jobs", "`jobs:` is empty."));
  }

  const jobIds = new Set(Object.keys(jobs));

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") {
      findings.push(
        finding(file, "error", "invalid-job", `Job '${jobId}' is not a mapping.`),
      );
      continue;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(jobId)) {
      findings.push(
        finding(
          file,
          "error",
          "invalid-job-id",
          `Job id '${jobId}' must start with a letter or _ and contain only alphanumerics, - and _.`,
          lineOfKey(source, jobId),
        ),
      );
    }

    for (const key of Object.keys(job)) {
      if (!JOB_KEYS.has(key)) {
        findings.push(
          finding(
            file,
            "warning",
            "unknown-job-key",
            `Job '${jobId}' has unknown key '${key}'.`,
            lineOfKey(source, key),
          ),
        );
      }
    }

    if (!job.uses && !job["runs-on"]) {
      findings.push(
        finding(
          file,
          "error",
          "missing-runs-on",
          `Job '${jobId}' has neither 'runs-on' nor 'uses'.`,
          lineOfKey(source, jobId),
          "  runs-on: ubuntu-latest",
        ),
      );
    }

    for (const need of ([] as string[]).concat((job.needs as string[]) ?? [])) {
      if (!jobIds.has(need)) {
        findings.push(
          finding(
            file,
            "error",
            "unknown-need",
            `Job '${jobId}' needs '${need}', which is not defined in this workflow.`,
            lineOfKey(source, jobId),
          ),
        );
      }
    }

    const steps = job.steps as Record<string, unknown>[] | undefined;
    if (steps && Array.isArray(steps)) {
      steps.forEach((step, index) => {
        if (!step || typeof step !== "object") return;
        if (!step.uses && !step.run) {
          findings.push(
            finding(
              file,
              "error",
              "invalid-step",
              `Job '${jobId}' step ${index + 1} has neither 'uses' nor 'run'.`,
              lineOfKey(source, jobId),
            ),
          );
        }
        if (step.uses && step.run) {
          findings.push(
            finding(
              file,
              "error",
              "invalid-step",
              `Job '${jobId}' step ${index + 1} sets both 'uses' and 'run'.`,
              lineOfKey(source, jobId),
            ),
          );
        }
      });
    }
  }

  return findings;
}

function lineFromOffset(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function lineOfKey(source: string, key: string): number | undefined {
  const lines = source.split("\n");
  const index = lines.findIndex((line) =>
    new RegExp(`^\\s*["']?${escapeRegex(key)}["']?\\s*:`).test(line),
  );
  return index === -1 ? undefined : index + 1;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function suggestEvent(event: string): string | undefined {
  const close = [...KNOWN_EVENTS].find(
    (known) =>
      known.startsWith(event.slice(0, 4)) || event.startsWith(known.slice(0, 4)),
  );
  return close ? `Did you mean '${close}'?` : undefined;
}
