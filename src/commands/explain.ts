import { Context } from "../core/context";
import { discoverWorkflows, requireWorkflows } from "../workflow/discover";
import { explainWorkflow } from "../workflow/explain";
import { findWorkflow, selectWorkflow } from "../prompts/workflow";
import { log } from "../ui/logger";
import type { GlobalFlags } from "../core/flags";

export async function explainCommand(
  target: string | undefined,
  flags: GlobalFlags,
): Promise<void> {
  const context = await Context.create(flags);
  const workflows = requireWorkflows(
    await discoverWorkflows({ root: context.root, tolerant: true }),
  );

  const workflow = target
    ? findWorkflow(workflows, target)
    : await selectWorkflow(workflows, context.interactive);

  log.plain();
  log.plain(explainWorkflow(workflow));
  log.plain();
}
