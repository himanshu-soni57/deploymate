import { readFile } from "node:fs/promises";
import YAML from "yaml";
import type { WorkflowRaw } from "../types/workflow";

export async function parseWorkflow(filePath: string) {
  const content = await readFile(filePath, "utf8");

  const parsed = YAML.parse(content) as Record<string, unknown>;

  const normalizedWorkflow: WorkflowRaw = {
    ...(parsed as object),
    name: String(parsed.name ?? "Unnamed Workflow"),
    on: (parsed.on ?? parsed.true ?? {}) as WorkflowRaw["on"],
    jobs: (parsed.jobs as WorkflowRaw["jobs"]) ?? {},
  };

  return {
    name: normalizedWorkflow.name!,
    on: normalizedWorkflow.on,
    raw: normalizedWorkflow,
  };
}
