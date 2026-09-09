import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { lintWorkflowSource } from "../workflow/lint";
import { log } from "../ui/logger";
import { pluralize } from "../utils/format";
import type { Finding } from "../audit/types";
import type { GlobalFlags } from "../core/flags";

const ICON: Record<Finding["severity"], string> = {
  error: pc.red("error"),
  warning: pc.yellow("warn "),
  info: pc.cyan("info "),
};

export function renderFindings(findings: Finding[]): void {
  let current = "";

  for (const finding of findings) {
    if (finding.workflow !== current) {
      current = finding.workflow;
      log.plain();
      log.plain(pc.bold(`.github/workflows/${current}`));
    }

    const location = finding.line ? pc.dim(`:${finding.line}`) : "";
    log.plain(
      `  ${ICON[finding.severity]} ${location.padEnd(6)} ${finding.message} ${pc.dim(`[${finding.rule}]`)}`,
    );

    if (finding.fix) {
      for (const line of finding.fix.split("\n")) {
        log.plain(`         ${pc.green(line)}`);
      }
    }
  }
}

export async function lintCommand(flags: GlobalFlags): Promise<void> {
  const context = await Context.create(flags);
  const workflows = await discoverWorkflows({ root: context.root, tolerant: true });

  if (!workflows.length) {
    log.warn("No workflows to lint.");
    return;
  }

  const findings = workflows.flatMap((workflow) =>
    lintWorkflowSource(workflow.source, workflow.filename),
  );

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    if (findings.some((finding) => finding.severity === "error")) process.exitCode = 1;
    return;
  }

  if (!findings.length) {
    log.plain();
    log.success(`${pluralize(workflows.length, "workflow")} validated, no problems found.`);
    return;
  }

  renderFindings(findings);

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;

  log.plain();
  log.plain(
    `  ${errors ? pc.red(`${errors} error(s)`) : pc.green("0 errors")}, ${pc.yellow(`${warnings} warning(s)`)}`,
  );

  if (errors) {
    throw new DeployPilotError(
      `${pluralize(errors, "workflow error")} must be fixed before these workflows will run.`,
    );
  }
}
