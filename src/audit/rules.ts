import type { WorkflowJob } from "../types/workflow";
import { lineOf, type Finding, type Rule, type RuleContext } from "./types";

const SHA = /^[0-9a-f]{40}$/;

function usesEntries(context: RuleContext): { value: string; job: string }[] {
  const entries: { value: string; job: string }[] = [];

  for (const [jobId, job] of Object.entries(context.workflow.jobs)) {
    if (job.uses) entries.push({ value: job.uses, job: jobId });
    for (const step of job.steps ?? []) {
      if (step.uses) entries.push({ value: step.uses, job: jobId });
    }
  }

  return entries;
}

function finding(
  context: RuleContext,
  rule: string,
  severity: Finding["severity"],
  message: string,
  snippet?: string,
  fix?: string,
): Finding {
  return {
    rule,
    severity,
    message,
    workflow: context.workflow.filename,
    line: snippet ? lineOf(context.workflow.source, snippet) : undefined,
    fix,
  };
}

const unpinnedActions: Rule = {
  id: "unpinned-action",
  description: "Third-party actions should be pinned to a commit SHA",
  run(context) {
    const findings: Finding[] = [];

    for (const { value } of usesEntries(context)) {
      if (value.startsWith("./") || value.startsWith("docker://")) continue;

      const [name, ref] = value.split("@");
      if (!ref || SHA.test(ref)) continue;

      const trusted = name?.startsWith("actions/") || name?.startsWith("github/");

      findings.push(
        finding(
          context,
          "unpinned-action",
          trusted ? "info" : "warning",
          `'${value}' is pinned to a mutable ref. Whoever controls '${name}' can change what runs in your pipeline.`,
          value,
          `Pin it to a commit SHA:\n  uses: ${name}@<40-char-sha>  # ${ref}`,
        ),
      );
    }

    return findings;
  },
};

const DEPRECATED: { pattern: RegExp; message: string; fix: string }[] = [
  {
    pattern: /^actions\/checkout@v[123]$/,
    message: "actions/checkout v1-v3 run on deprecated Node versions",
    fix: "Upgrade to actions/checkout@v4 or newer.",
  },
  {
    pattern: /^actions\/setup-node@v[123]$/,
    message: "actions/setup-node v1-v3 are deprecated",
    fix: "Upgrade to actions/setup-node@v4 or newer.",
  },
  {
    pattern: /^actions\/cache@v[123]$/,
    message: "actions/cache v1-v3 are deprecated",
    fix: "Upgrade to actions/cache@v4 or newer.",
  },
  {
    pattern: /^actions\/upload-artifact@v[123]$/,
    message: "actions/upload-artifact v1-v3 stopped working in 2025",
    fix: "Upgrade to actions/upload-artifact@v4.",
  },
];

const deprecatedActions: Rule = {
  id: "deprecated-action",
  description: "Flags actions that GitHub has deprecated",
  run(context) {
    const findings: Finding[] = [];

    for (const { value } of usesEntries(context)) {
      for (const entry of DEPRECATED) {
        if (entry.pattern.test(value)) {
          findings.push(
            finding(context, "deprecated-action", "warning", entry.message, value, entry.fix),
          );
        }
      }
    }

    return findings;
  },
};

const deprecatedCommands: Rule = {
  id: "deprecated-command",
  description: "Flags workflow commands GitHub removed",
  run(context) {
    const findings: Finding[] = [];
    const source = context.workflow.source;

    for (const command of ["set-output", "save-state", "set-env", "add-path"]) {
      const snippet = `::${command}`;
      if (source.includes(snippet)) {
        findings.push(
          finding(
            context,
            "deprecated-command",
            "error",
            `The '${command}' workflow command was removed and is a no-op.`,
            snippet,
            command === "set-output"
              ? 'Use: echo "name=value" >> "$GITHUB_OUTPUT"'
              : 'Write to the matching $GITHUB_* environment file instead.',
          ),
        );
      }
    }

    return findings;
  },
};

const missingPermissions: Rule = {
  id: "missing-permissions",
  description: "Workflows without an explicit permissions block get broad defaults",
  run(context) {
    if (context.workflow.raw.permissions !== undefined) return [];

    const jobsWithPermissions = Object.values(context.workflow.jobs).filter(
      (job) => job.permissions !== undefined,
    );
    if (jobsWithPermissions.length === Object.keys(context.workflow.jobs).length) {
      return [];
    }

    return [
      finding(
        context,
        "missing-permissions",
        "warning",
        "No `permissions:` block. GITHUB_TOKEN may fall back to write access for the whole repository.",
        undefined,
        "Add the least privilege the workflow needs:\n  permissions:\n    contents: read",
      ),
    ];
  },
};

const missingConcurrency: Rule = {
  id: "missing-concurrency",
  description: "Deployment workflows should not run concurrently",
  run(context) {
    if (context.workflow.raw.concurrency !== undefined) return [];

    const isDeploy =
      /deploy|release|publish|prod/i.test(context.workflow.name) ||
      /deploy|release|publish|prod/i.test(context.workflow.filename);

    if (!isDeploy) return [];

    return [
      finding(
        context,
        "missing-concurrency",
        "warning",
        "No `concurrency:` group. Two deployments started close together will race.",
        undefined,
        "concurrency:\n  group: deploy-${{ github.ref }}\n  cancel-in-progress: false",
      ),
    ];
  },
};

const missingTimeout: Rule = {
  id: "missing-timeout",
  description: "Jobs without a timeout can burn 6 hours of runner minutes",
  run(context) {
    const findings: Finding[] = [];

    for (const [jobId, job] of Object.entries(context.workflow.jobs)) {
      if (job["timeout-minutes"] !== undefined || job.uses) continue;
      findings.push(
        finding(
          context,
          "missing-timeout",
          "info",
          `Job '${jobId}' has no timeout-minutes; GitHub's default is 360 minutes.`,
          `${jobId}:`,
          "  timeout-minutes: 15",
        ),
      );
    }

    return findings;
  },
};

const untrustedCheckout: Rule = {
  id: "untrusted-checkout",
  description: "pull_request_target with a PR checkout exposes repository secrets",
  run(context) {
    if (!("pull_request_target" in context.workflow.on)) return [];

    const risky = Object.values(context.workflow.jobs).some((job) =>
      (job.steps ?? []).some(
        (step) =>
          step.uses?.startsWith("actions/checkout") &&
          /github\.event\.pull_request\.head/.test(JSON.stringify(step.with ?? {})),
      ),
    );

    if (!risky) return [];

    return [
      finding(
        context,
        "untrusted-checkout",
        "error",
        "This workflow runs on `pull_request_target` and checks out the pull request's head. Any fork can then run arbitrary code with access to your secrets.",
        "pull_request_target",
        "Use `pull_request` instead, or check out the base ref and never execute PR code.",
      ),
    ];
  },
};

const noManualEscapeHatch: Rule = {
  id: "no-manual-trigger",
  description: "Deployment workflows should be manually re-runnable",
  run(context) {
    if ("workflow_dispatch" in context.workflow.on) return [];

    const isDeploy =
      /deploy|release|publish|prod/i.test(context.workflow.name) ||
      /deploy|release|publish|prod/i.test(context.workflow.filename);

    if (!isDeploy) return [];

    return [
      finding(
        context,
        "no-manual-trigger",
        "info",
        "No `workflow_dispatch:`. You cannot re-run this deployment without pushing a new commit or tag.",
        undefined,
        "Add to the `on:` block:\n  workflow_dispatch:",
      ),
    ];
  },
};

const SECRET_REF = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;

const missingSecrets: Rule = {
  id: "missing-secret",
  description: "Secrets referenced in YAML that the repository does not define",
  needsApi: true,
  run(context) {
    if (!context.knownSecrets) return [];

    const referenced = new Set<string>();
    for (const match of context.workflow.source.matchAll(SECRET_REF)) {
      const name = match[1]!;
      if (name === "GITHUB_TOKEN" || name.startsWith("ACTIONS_")) continue;
      referenced.add(name);
    }

    const known = new Set(context.knownSecrets);

    return [...referenced]
      .filter((name) => !known.has(name))
      .map((name) =>
        finding(
          context,
          "missing-secret",
          "error",
          `Secret '${name}' is referenced but not configured on this repository.`,
          `secrets.${name}`,
          `Add it, or the deployment fails at runtime:\n  gh secret set ${name}`,
        ),
      );
  },
};

const HARDCODED = [
  { pattern: /gh[pousr]_[A-Za-z0-9]{16,}/, label: "GitHub token" },
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key id" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key" },
  { pattern: /sk-[A-Za-z0-9]{32,}/, label: "API key" },
];

const hardcodedSecrets: Rule = {
  id: "hardcoded-secret",
  description: "Credentials committed directly into the workflow file",
  run(context) {
    const findings: Finding[] = [];

    for (const entry of HARDCODED) {
      const match = entry.pattern.exec(context.workflow.source);
      if (!match) continue;

      findings.push(
        finding(
          context,
          "hardcoded-secret",
          "error",
          `A ${entry.label} appears to be hardcoded in this workflow.`,
          match[0].slice(0, 12),
          "Move it to a repository secret and reference it as ${{ secrets.NAME }}.\nRotate the exposed credential immediately.",
        ),
      );
    }

    return findings;
  },
};

const staleRunners: Rule = {
  id: "stale-runner",
  description: "Runner images that GitHub has retired",
  run(context) {
    const findings: Finding[] = [];
    const retired = ["ubuntu-18.04", "ubuntu-20.04", "macos-11", "macos-12", "windows-2019"];

    for (const [jobId, job] of Object.entries(context.workflow.jobs)) {
      const runners = ([] as string[]).concat((job as WorkflowJob)["runs-on"] ?? []);
      for (const runner of runners) {
        if (retired.includes(runner)) {
          findings.push(
            finding(
              context,
              "stale-runner",
              "warning",
              `Job '${jobId}' targets '${runner}', which GitHub has retired.`,
              runner,
              "Move to a supported image, e.g. ubuntu-latest.",
            ),
          );
        }
      }
    }

    return findings;
  },
};

const unreachableWorkflow: Rule = {
  id: "unreachable-workflow",
  description: "Workflows that nothing can trigger",
  run(context) {
    const events = Object.keys(context.workflow.on);
    if (events.length) return [];

    return [
      finding(
        context,
        "unreachable-workflow",
        "error",
        "This workflow declares no `on:` triggers, so it can never run.",
        undefined,
        "Add a trigger, e.g.\n  on:\n    workflow_dispatch:",
      ),
    ];
  },
};

export const RULES: Rule[] = [
  unreachableWorkflow,
  untrustedCheckout,
  hardcodedSecrets,
  deprecatedCommands,
  missingSecrets,
  unpinnedActions,
  deprecatedActions,
  missingPermissions,
  missingConcurrency,
  staleRunners,
  missingTimeout,
  noManualEscapeHatch,
];
