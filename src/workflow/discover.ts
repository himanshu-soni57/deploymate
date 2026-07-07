import fg from "fast-glob";
import path from "node:path";
import { parseWorkflow } from "./parser";
import type { Workflow } from "../types/workflow";

export async function discoverWorkflows(): Promise<Workflow[]> {
  const files = await fg(".github/workflows/*.{yml,yaml}", {
    cwd: process.cwd(),
    absolute: true,
  });

  const workflows: Workflow[] = [];

  for (const file of files) {
    const parsed = await parseWorkflow(file);

    workflows.push({
      name: parsed.name,
      filename: path.basename(file),
      path: file,
      on: parsed.on,
      raw: parsed.raw,
    });
  }

  return workflows;
}
