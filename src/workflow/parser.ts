import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DeployPilotError } from "../errors";
import type {
  PushTrigger,
  Workflow,
  WorkflowJob,
  WorkflowRaw,
  WorkflowTrigger,
} from "../types/workflow";

/** GitHub allows a scalar, a sequence, or a mapping for list-shaped fields. */
function toArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function normalizePush(value: unknown): PushTrigger | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return {};

  const raw = value as Record<string, unknown>;
  const trigger: PushTrigger = {};

  const branches = toArray(raw.branches);
  const branchesIgnore = toArray(raw["branches-ignore"]);
  const tags = toArray(raw.tags);
  const tagsIgnore = toArray(raw["tags-ignore"]);
  const paths = toArray(raw.paths);
  const pathsIgnore = toArray(raw["paths-ignore"]);

  if (branches.length) trigger.branches = branches;
  if (branchesIgnore.length) trigger["branches-ignore"] = branchesIgnore;
  if (tags.length) trigger.tags = tags;
  if (tagsIgnore.length) trigger["tags-ignore"] = tagsIgnore;
  if (paths.length) trigger.paths = paths;
  if (pathsIgnore.length) trigger["paths-ignore"] = pathsIgnore;

  return trigger;
}

/**
 * `on:` accepts three shapes:
 *   on: push
 *   on: [push, workflow_dispatch]
 *   on: { push: { branches: [main] } }
 *
 * The YAML 1.1 spec also treats a bare `on` key as the boolean `true`. The
 * `yaml` package defaults to 1.2 (where it stays a string), but a document
 * with an explicit `%YAML 1.1` directive would still land under `true`, so
 * both keys are checked.
 */
export function normalizeTriggers(input: unknown): WorkflowTrigger {
  if (input === null || input === undefined) return {};

  if (typeof input === "string") {
    return { [input]: null } as WorkflowTrigger;
  }

  if (Array.isArray(input)) {
    const trigger: WorkflowTrigger = {};
    for (const event of input) trigger[String(event)] = null;
    return trigger;
  }

  const raw = input as Record<string, unknown>;
  const trigger: WorkflowTrigger = { ...raw };

  if ("push" in raw) trigger.push = normalizePush(raw.push);
  if ("pull_request" in raw) trigger.pull_request = normalizePush(raw.pull_request);
  if ("pull_request_target" in raw) {
    trigger.pull_request_target = normalizePush(raw.pull_request_target);
  }

  if ("release" in raw) {
    const release = raw.release as Record<string, unknown> | null;
    trigger.release = { types: toArray(release?.types) };
  }

  if ("repository_dispatch" in raw) {
    const dispatch = raw.repository_dispatch as Record<string, unknown> | null;
    trigger.repository_dispatch = { types: toArray(dispatch?.types) };
  }

  return trigger;
}

export interface ParsedWorkflow {
  name: string;
  on: WorkflowTrigger;
  jobs: Record<string, WorkflowJob>;
  raw: WorkflowRaw;
  source: string;
}

export function parseWorkflowSource(
  source: string,
  filename: string,
): ParsedWorkflow {
  let document: Record<string, unknown>;

  try {
    document = (YAML.parse(source) ?? {}) as Record<string, unknown>;
  } catch (error) {
    throw new DeployPilotError(`Could not parse '${filename}': invalid YAML.`, {
      hint: error instanceof Error ? error.message : undefined,
      cause: error,
    });
  }

  if (typeof document !== "object" || Array.isArray(document)) {
    throw new DeployPilotError(
      `'${filename}' is not a valid workflow: the document root must be a mapping.`,
    );
  }

  const triggerSource = "on" in document ? document.on : document.true;
  const on = normalizeTriggers(triggerSource);
  const jobs = (document.jobs ?? {}) as Record<string, WorkflowJob>;

  const raw: WorkflowRaw = {
    ...document,
    name: document.name ? String(document.name) : undefined,
    on,
    jobs,
  };

  return {
    name: raw.name ?? path.basename(filename, path.extname(filename)),
    on,
    jobs,
    raw,
    source,
  };
}

export async function parseWorkflowFile(filePath: string): Promise<Workflow> {
  const source = await readFile(filePath, "utf8");
  const filename = path.basename(filePath);
  const parsed = parseWorkflowSource(source, filename);

  return {
    name: parsed.name,
    filename,
    path: filePath,
    on: parsed.on,
    jobs: parsed.jobs,
    raw: parsed.raw,
    source: parsed.source,
  };
}
