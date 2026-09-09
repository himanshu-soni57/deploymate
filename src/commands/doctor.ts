import pc from "picocolors";
import { Context } from "../core/context";
import { audit, summarize } from "../audit/doctor";
import { discoverWorkflows } from "../workflow/discover";
import { lintWorkflowSource } from "../workflow/lint";
import { log } from "../ui/logger";
import { pluralize } from "../utils/format";
import { renderFindings } from "./lint";
import type { GlobalFlags } from "../core/flags";

export interface DoctorFlags extends GlobalFlags {
  skip?: string[];
  only?: string[];
  /** Exit non-zero when warnings are present, not just errors. */
  strict?: boolean;
}

export async function doctorCommand(flags: DoctorFlags): Promise<void> {
  const context = await Context.create(flags);
  const workflows = await discoverWorkflows({ root: context.root, tolerant: true });

  if (!workflows.length) {
    log.warn("No workflows found; nothing to audit.");
    return;
  }

  let knownSecrets: string[] | undefined;
  let knownVariables: string[] | undefined;

  try {
    const secrets = await context.secrets();
    knownSecrets = await secrets.listSecretNames();
    knownVariables = await secrets.listVariableNames();
  } catch {
    log.dim("  (skipping secret checks: no GitHub token available)");
  }

  const structural = workflows.flatMap((workflow) =>
    lintWorkflowSource(workflow.source, workflow.filename),
  );

  const findings = [
    ...structural,
    ...audit(workflows, {
      knownSecrets,
      knownVariables,
      only: flags.only,
      skip: flags.skip,
    }),
  ];

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    if (findings.some((finding) => finding.severity === "error")) process.exitCode = 1;
    return;
  }

  log.heading(`Auditing ${pluralize(workflows.length, "workflow")}`);

  if (!findings.length) {
    log.plain();
    log.success("No problems found.");
    return;
  }

  renderFindings(findings);

  const counts = summarize(findings);
  log.plain();
  log.plain(
    `  ${counts.error ? pc.red(`${counts.error} error(s)`) : pc.green("0 errors")}, ` +
      `${pc.yellow(`${counts.warning} warning(s)`)}, ${pc.dim(`${counts.info} note(s)`)}`,
  );

  if (counts.error > 0 || (flags.strict && counts.warning > 0)) {
    process.exitCode = 1;
  }
}
