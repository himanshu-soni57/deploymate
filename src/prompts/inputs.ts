import { confirm, select, text } from "@clack/prompts";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import { log } from "../ui/logger";
import type { WorkflowInput } from "../types/workflow";

export function parseInputFlags(pairs: string[] = []): Record<string, string> {
  const result: Record<string, string> = {};

  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0) {
      throw new DeployPilotError(`Invalid --input '${pair}'.`, {
        hint: "Use key=value, e.g. --input environment=staging",
      });
    }
    result[pair.slice(0, index)] = pair.slice(index + 1);
  }

  return result;
}

/**
 * Turns the workflow's declared `workflow_dispatch.inputs` schema into
 * prompts. This is the feature the WorkflowInput type was written for but
 * which was never wired up.
 */
export async function collectInputs(
  schema: Record<string, WorkflowInput>,
  options: {
    interactive: boolean;
    provided: Record<string, string | number | boolean>;
    environments?: string[];
  },
): Promise<Record<string, string>> {
  const names = Object.keys(schema);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(options.provided)) {
    if (!names.includes(key) && names.length) {
      log.warn(
        `Input '${key}' is not declared by this workflow; GitHub will reject unknown inputs.`,
      );
    }
    result[key] = String(value);
  }

  for (const name of names) {
    if (name in result) continue;

    const definition = schema[name]!;
    const fallback =
      definition.default !== undefined ? String(definition.default) : undefined;

    if (!options.interactive) {
      if (definition.required && fallback === undefined) {
        throw new DeployPilotError(`Workflow input '${name}' is required.`, {
          hint: `Pass it with --input ${name}=<value>`,
        });
      }
      if (fallback !== undefined) result[name] = fallback;
      continue;
    }

    const message = definition.description
      ? `${name} - ${definition.description}`
      : name;

    if (definition.type === "boolean") {
      const answer = unwrap(
        await confirm({ message, initialValue: fallback === "true" }),
      );
      result[name] = String(answer);
      continue;
    }

    if (definition.type === "choice" && definition.options?.length) {
      result[name] = unwrap(
        await select({
          message,
          initialValue: fallback,
          options: definition.options.map((option) => ({
            value: option,
            label: option,
          })),
        }),
      );
      continue;
    }

    if (definition.type === "environment" && options.environments?.length) {
      result[name] = unwrap(
        await select({
          message,
          initialValue: fallback,
          options: options.environments.map((environment) => ({
            value: environment,
            label: environment,
          })),
        }),
      );
      continue;
    }

    const answer = unwrap(
      await text({
        message,
        placeholder: fallback,
        defaultValue: fallback,
        validate: (value = "") => {
          if (definition.required && !value.trim() && !fallback) {
            return `${name} is required.`;
          }
          if (definition.type === "number" && value.trim() && Number.isNaN(Number(value))) {
            return `${name} must be a number.`;
          }
          return undefined;
        },
      }),
    );

    const resolved = answer?.trim() || fallback;
    if (resolved !== undefined) result[name] = resolved;
  }

  return result;
}
