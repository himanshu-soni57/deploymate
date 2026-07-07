import { readFile } from "node:fs/promises";
import YAML from "yaml";

export async function parseWorkflow(filePath: string) {
  const content = await readFile(filePath, "utf8");

  const workflow = YAML.parse(content);

  const normalizedWorkflow = {
    ...workflow,
    on: workflow.on ?? workflow.true,
  };

  return {
    name: normalizedWorkflow.name,
    on: normalizedWorkflow.on,
    raw: normalizedWorkflow,
  };
}
