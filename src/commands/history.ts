import pc from "picocolors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { findWorkflow } from "../prompts/workflow";
import { log } from "../ui/logger";
import { renderTable } from "../ui/table";
import { duration, relativeTime, truncate } from "../utils/format";
import { statusIcon } from "../watch/render";
import type { GlobalFlags } from "../core/flags";

export interface HistoryFlags extends GlobalFlags {
  limit?: number;
  workflow?: string;
  branch?: string;
  event?: string;
  failed?: boolean;
}

export async function historyCommand(flags: HistoryFlags): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();

  let workflowFile: string | undefined;
  if (flags.workflow) {
    const workflows = await discoverWorkflows({ root: context.root, tolerant: true });
    workflowFile = workflows.length
      ? findWorkflow(workflows, flags.workflow).filename
      : flags.workflow;
  }

  const history = await runs.listRuns({
    workflowFile,
    branch: flags.branch,
    event: flags.event,
    limit: flags.limit ?? 20,
  });

  const rows = flags.failed
    ? history.filter((run) => run.conclusion && run.conclusion !== "success")
    : history;

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  log.heading(`Deployment history (${rows.length})`);
  log.plain(
    renderTable(rows, [
      { header: "RUN", value: (run) => `#${run.run_number}` },
      { header: "WORKFLOW", value: (run) => truncate(run.name ?? "-", 24) },
      { header: "RESULT", value: (run) => statusIcon(run.status, run.conclusion).trim() },
      { header: "REF", value: (run) => truncate(run.head_branch ?? run.head_sha.slice(0, 8), 20) },
      { header: "COMMIT", value: (run) => pc.dim(run.head_sha.slice(0, 8)) },
      { header: "BY", value: (run) => run.actor?.login ?? "-" },
      {
        header: "TOOK",
        value: (run) =>
          run.status === "completed"
            ? duration(
                new Date(run.updated_at).getTime() -
                  new Date(run.run_started_at ?? run.created_at).getTime(),
              )
            : pc.dim("running"),
        align: "right",
      },
      { header: "WHEN", value: (run) => pc.dim(relativeTime(run.created_at)) },
    ]),
  );
  log.plain();
}
