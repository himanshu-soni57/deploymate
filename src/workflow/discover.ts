import { readdir } from "node:fs/promises";
import path from "node:path";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";
import type { Workflow } from "../types/workflow";
import { parseWorkflowFile } from "./parser";

const WORKFLOW_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

export interface DiscoverOptions {
  /** Repository root. Workflows only ever live under the root's .github dir. */
  root: string;
  /** Skip files that fail to parse instead of aborting the whole run. */
  tolerant?: boolean;
}

export async function discoverWorkflows(
  options: DiscoverOptions,
): Promise<Workflow[]> {
  const directory = path.join(options.root, WORKFLOW_DIR);

  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => EXTENSIONS.has(path.extname(entry).toLowerCase()))
    .sort()
    .map((entry) => path.join(directory, entry));

  const workflows: Workflow[] = [];

  for (const file of files) {
    try {
      workflows.push(await parseWorkflowFile(file));
    } catch (error) {
      if (!options.tolerant) throw error;
      log.warn(
        `Skipping ${path.basename(file)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return workflows;
}

export function requireWorkflows(workflows: Workflow[]): Workflow[] {
  if (workflows.length) return workflows;

  throw new DeployPilotError("No GitHub Actions workflows found.", {
    hint:
      "DeployPilot looks for .github/workflows/*.yml under the repository root.\n" +
      "Scaffold one with:\n  deploypilot new",
  });
}
