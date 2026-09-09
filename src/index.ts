#!/usr/bin/env node

import { Command, Option } from "commander";
import pc from "picocolors";
import {
  cancelCommand,
  completionCommand,
  deployCommand,
  doctorCommand,
  explainCommand,
  historyCommand,
  initCommand,
  lintCommand,
  listCommand,
  logsCommand,
  newCommand,
  rerunCommand,
  rollbackCommand,
  secretsCommand,
  statusCommand,
  watchCommand,
} from "./commands";
import { handleError } from "./utils/error";
import { VERSION } from "./version";

const program = new Command();

program
  .name("deploypilot")
  .description("Trigger, monitor, and audit GitHub Actions deployments.")
  .version(VERSION, "-v, --version")
  .option("-C, --cwd <path>", "run as if started in <path>")
  .option("--config <path>", "path to a deploypilot config file")
  .option("--json", "machine-readable output")
  .option("--verbose", "print debug output")
  .option("-q, --quiet", "suppress non-error output")
  .option("--remote <name>", "git remote to use")
  .showHelpAfterError();

/** Merges the root options into each subcommand's own options. */
function withGlobals<T extends object>(command: Command, options: T): T {
  return { ...program.opts(), ...options } as T;
}

program
  .command("deploy", { isDefault: true })
  .argument("[environment]", "environment name from your config")
  .description("Commit, push or dispatch, and start a workflow run")
  .option("-w, --workflow <file>", "workflow file or name")
  .addOption(
    new Option("-s, --strategy <kind>", "how to trigger the workflow").choices([
      "tag",
      "branch",
      "dispatch",
      "release",
    ]),
  )
  .option("-m, --message <message>", "commit message")
  .option("-a, --all", "commit every change in the working tree")
  .option("-f, --file <path...>", "commit only these files (repeatable, globs allowed)")
  .option("--staged", "commit only what is already staged")
  .option("--no-commit", "commit nothing; deploy the commits that already exist")
  .option("-t, --tag <name>", "use this exact tag")
  .option("-r, --ref <ref>", "tag or dispatch this commit instead of HEAD")
  .addOption(
    new Option("-b, --bump <type>", "version bump for tag strategies").choices([
      "major",
      "minor",
      "patch",
      "prerelease",
      "auto",
    ]),
  )
  .option("--sign", "create a GPG-signed tag")
  .option("--release", "also publish a GitHub Release")
  .option("-i, --input <key=value...>", "workflow_dispatch inputs")
  .option("--no-fetch", "skip fetching the remote during preflight")
  .option("--no-push", "do everything locally but do not push")
  .option("--watch", "follow the run and report its outcome")
  .option("--empty-commit", "create an empty commit when there is nothing to push")
  .option("--signoff", "add a Signed-off-by trailer")
  .option("--dry-run", "show every action without performing any of them")
  .option("-y, --yes", "accept defaults and skip confirmations")
  .option("--force", "continue past failed preflight checks")
  .action(async (environment: string | undefined, options) => {
    // Commander turns `--no-commit` into `commit: false`; the rest of the
    // codebase reads the positive flag name.
    const { commit, ...rest } = options as { commit?: boolean };
    await deployCommand(
      withGlobals(program, { ...rest, environment, noCommit: commit === false }),
    );
  });

program
  .command("watch")
  .argument("[run-id]", "run to watch; defaults to the latest active run")
  .description("Follow a workflow run and surface failing steps")
  .option("-w, --workflow <file>", "restrict to this workflow")
  .option("-b, --branch <name>", "restrict to this branch")
  .action(async (runId, options) => {
    await watchCommand(runId, withGlobals(program, options));
  });

program
  .command("status")
  .description("Show in-flight runs, environment state, and recent history")
  .option("-n, --limit <count>", "recent runs to show", (value) => Number(value))
  .action(async (options) => {
    await statusCommand(withGlobals(program, options));
  });

program
  .command("history")
  .description("List past deployments")
  .option("-n, --limit <count>", "runs to list", (value) => Number(value))
  .option("-w, --workflow <file>", "restrict to this workflow")
  .option("-b, --branch <name>", "restrict to this branch")
  .option("-e, --event <event>", "restrict to this trigger event")
  .option("--failed", "only show runs that did not succeed")
  .action(async (options) => {
    await historyCommand(withGlobals(program, options));
  });

program
  .command("logs")
  .argument("[run-id]", "run to read; defaults to the most recent")
  .description("Print logs for a run, failing steps first")
  .option("-j, --job <name>", "only this job")
  .option("--no-failed-only", "print every job's full log")
  .action(async (runId, options) => {
    await logsCommand(runId, withGlobals(program, options));
  });

program
  .command("cancel")
  .argument("[run-id]", "run to cancel; defaults to the active one")
  .description("Cancel a workflow run")
  .option("-y, --yes", "skip the confirmation")
  .action(async (runId, options) => {
    await cancelCommand(runId, withGlobals(program, options));
  });

program
  .command("rerun")
  .argument("[run-id]", "run to re-run; defaults to the most recent")
  .description("Re-run a workflow run")
  .option("--failed", "only re-run the jobs that failed")
  .option("--watch", "follow the new run")
  .option("-y, --yes", "skip the confirmation")
  .action(async (runId, options) => {
    await rerunCommand(runId, withGlobals(program, options));
  });

program
  .command("rollback")
  .description("Re-deploy a previous successful run")
  .option("-w, --workflow <file>", "workflow to roll back")
  .option("--run <id>", "roll back to this run id or number")
  .option("-i, --input <key=value...>", "workflow_dispatch inputs")
  .option("--watch", "follow the rollback run")
  .option("-y, --yes", "skip the typed confirmation")
  .action(async (options) => {
    await rollbackCommand(withGlobals(program, options));
  });

program
  .command("doctor")
  .description("Audit workflows for security, correctness, and cost problems")
  .option("--only <rule...>", "run only these rules")
  .option("--skip <rule...>", "skip these rules")
  .option("--strict", "exit non-zero on warnings too")
  .action(async (options) => {
    await doctorCommand(withGlobals(program, options));
  });

program
  .command("lint")
  .description("Validate workflow YAML with line-accurate errors")
  .action(async (options) => {
    await lintCommand(withGlobals(program, options));
  });

program
  .command("explain")
  .argument("[workflow]", "workflow file or name")
  .description("Describe in plain English when and how a workflow runs")
  .action(async (workflow, options) => {
    await explainCommand(workflow, withGlobals(program, options));
  });

program
  .command("list")
  .alias("ls")
  .description("List discovered workflows and how they can be triggered")
  .action(async (options) => {
    await listCommand(withGlobals(program, options));
  });

program
  .command("new")
  .description("Scaffold a workflow from a template")
  .option("-t, --template <id>", "template id")
  .option("-o, --output <filename>", "file name to write")
  .option("--dry-run", "print the file instead of writing it")
  .action(async (options) => {
    await newCommand(withGlobals(program, options));
  });

program
  .command("secrets")
  .description("Compare secrets referenced in workflows against configured ones")
  .action(async (options) => {
    await secretsCommand(withGlobals(program, options));
  });

program
  .command("init")
  .description("Create a deploypilot config from your existing workflows")
  .addOption(new Option("--format <format>", "config format").choices(["ts", "json"]))
  .option("--dry-run", "print the config instead of writing it")
  .action(async (options) => {
    await initCommand(withGlobals(program, options));
  });

program
  .command("completion")
  .argument("<shell>", "bash, zsh, or fish")
  .description("Print a shell completion script")
  .action((shell: string) => {
    completionCommand(shell);
  });

async function bootstrap(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (error) {
    handleError(error);
  }
}

process.on("unhandledRejection", (error) => {
  handleError(error);
});

process.on("SIGINT", () => {
  console.error(`\n${pc.yellow("Interrupted.")}`);
  process.exit(130);
});

await bootstrap();
