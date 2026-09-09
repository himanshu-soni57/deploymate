import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { confirm, multiselect, select, text } from "@clack/prompts";
import { CancelledError } from "../errors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { buildPlan } from "../workflow/planner";
import { log } from "../ui/logger";
import { unwrap } from "../ui/prompt";
import type { DeployPilotConfig, EnvironmentConfig } from "../config";
import type { GlobalFlags } from "../core/flags";

export interface InitFlags extends GlobalFlags {
  format?: "ts" | "json";
}

/**
 * Reads the repository's real workflows and writes a config that matches them,
 * rather than dumping a generic template the user has to correct.
 */
export async function initCommand(flags: InitFlags): Promise<void> {
  const context = await Context.create(flags);
  context.requireInteractive("deploypilot init");

  const workflows = await discoverWorkflows({ root: context.root, tolerant: true });
  const deployable = workflows.filter(
    (workflow) => buildPlan(workflow).candidates.length > 0,
  );

  if (!deployable.length) {
    log.warn("No triggerable workflows found. Scaffold one first:");
    log.plain("  deploypilot new");
    return;
  }

  const chosen = unwrap(
    await multiselect({
      message: "Which workflows should become environments?",
      required: true,
      options: deployable.map((workflow) => ({
        value: workflow,
        label: workflow.name,
        hint: workflow.filename,
      })),
    }),
  );

  const environments: Record<string, EnvironmentConfig> = {};

  for (const workflow of chosen) {
    const name = unwrap(
      await text({
        message: `Environment name for '${workflow.name}'`,
        placeholder: guessName(workflow.filename),
        defaultValue: guessName(workflow.filename),
        validate: (value = "") =>
          /^[a-z0-9][a-z0-9-]*$/.test(value.trim() || guessName(workflow.filename))
            ? undefined
            : "Use lowercase letters, digits and dashes.",
      }),
    );

    const plan = buildPlan(workflow);
    const candidate = plan.candidates[0]!;

    const config: EnvironmentConfig = {
      workflow: workflow.filename,
      strategy: candidate.strategy.kind,
    };

    if (candidate.strategy.kind === "branch" && candidate.strategy.branches[0]) {
      config.requireBranch = candidate.strategy.branches[0];
    }

    if (candidate.strategy.kind === "tag") {
      config.versioning = unwrap(
        await select({
          message: `Versioning for '${name}'`,
          options: [
            { value: "prompt" as const, label: "Ask every time", hint: "recommended" },
            { value: "semver" as const, label: "Semantic versioning" },
            { value: "calver" as const, label: "Calendar versioning" },
            { value: "timestamp" as const, label: "Timestamp" },
          ],
        }),
      );
    }

    const isProduction = /prod|release|live/i.test(name);
    config.confirmWith = isProduction ? "type-name" : "confirm";
    config.requireClean = isProduction;

    const gate = unwrap(
      await text({
        message: `Commands to run before deploying '${name}' (comma separated, blank for none)`,
        placeholder: "bun test, bun run build",
        defaultValue: "",
      }),
    );

    const commands = gate
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (commands.length) config.preDeploy = commands;

    config.watch = unwrap(
      await confirm({
        message: `Watch the run to completion for '${name}'?`,
        initialValue: isProduction,
      }),
    );

    environments[name.trim() || guessName(workflow.filename)] = config;
  }

  const names = Object.keys(environments);
  const defaultEnvironment =
    names.length === 1
      ? names[0]
      : unwrap(
          await select({
            message: "Default environment",
            options: names.map((name) => ({ value: name, label: name })),
          }),
        );

  const convention = unwrap(
    await select({
      message: "Commit message style",
      options: [
        { value: "free" as const, label: "Anything goes" },
        {
          value: "conventional" as const,
          label: "Conventional Commits",
          hint: "enables automatic semver bumps",
        },
      ],
    }),
  );

  const config: DeployPilotConfig = {
    defaultEnvironment,
    environments,
    commit: { convention },
  };

  const format =
    flags.format ??
    unwrap(
      await select({
        message: "Config format",
        options: [
          {
            value: "ts" as const,
            label: "deploypilot.config.ts",
            hint: "typed; requires the Bun runtime",
          },
          {
            value: "json" as const,
            label: "deploypilot.config.json",
            hint: "works everywhere",
          },
        ],
      }),
    );

  const file = path.join(
    context.root,
    format === "ts" ? "deploypilot.config.ts" : "deploypilot.config.json",
  );

  if (existsSync(file)) {
    const overwrite = unwrap(
      await confirm({
        message: `${path.basename(file)} exists. Overwrite it?`,
        initialValue: false,
      }),
    );
    if (!overwrite) throw new CancelledError();
  }

  const content =
    format === "ts"
      ? `import { defineConfig } from "deploypilot";\n\nexport default defineConfig(${JSON.stringify(config, null, 2)});\n`
      : `${JSON.stringify(config, null, 2)}\n`;

  if (context.dryRun) {
    log.dryRun(`write ${path.basename(file)}`);
    log.plain(content);
    return;
  }

  await writeFile(file, content, "utf8");

  log.plain();
  log.success(`Created ${pc.bold(path.basename(file))}`);
  log.plain();
  log.info("Deploy without any prompts:");
  for (const name of names) log.plain(`  deploypilot deploy ${name}`);
  log.plain();
}

function guessName(filename: string): string {
  return filename
    .replace(/\.(ya?ml)$/, "")
    .replace(/^deploy[-_]?/, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase() || "default";
}
