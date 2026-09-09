import pc from "picocolors";
import { Context } from "../core/context";
import { discoverWorkflows, requireWorkflows } from "../workflow/discover";
import { buildPlan } from "../workflow/planner";
import { log } from "../ui/logger";
import { renderTable } from "../ui/table";
import type { GlobalFlags } from "../core/flags";

export async function listCommand(flags: GlobalFlags): Promise<void> {
  const context = await Context.create(flags);
  const workflows = requireWorkflows(
    await discoverWorkflows({ root: context.root, tolerant: true }),
  );

  const rows = workflows.map((workflow) => {
    const plan = buildPlan(workflow);
    return {
      name: workflow.name,
      file: workflow.filename,
      triggers: Object.keys(workflow.on).join(", ") || "none",
      strategies: plan.candidates.length
        ? plan.candidates.map((candidate) => candidate.strategy.kind).join(", ")
        : pc.dim("not triggerable"),
    };
  });

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  log.heading(`Workflows (${workflows.length})`);
  log.plain(
    renderTable(rows, [
      { header: "NAME", value: (row) => row.name },
      { header: "FILE", value: (row) => pc.dim(row.file) },
      { header: "TRIGGERS", value: (row) => row.triggers },
      { header: "DEPLOYPILOT", value: (row) => row.strategies },
    ]),
  );
}
