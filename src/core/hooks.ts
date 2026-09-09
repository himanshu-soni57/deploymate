import { spawn } from "node:child_process";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";

export interface RunCommandOptions {
  cwd: string;
  dryRun?: boolean;
  env?: Record<string, string>;
}

function execute(command: string, options: RunCommandOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: "inherit",
      env: { ...process.env, ...options.env },
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * Runs configured gate commands (tests, lint, build) before anything is
 * pushed. A non-zero exit aborts the deployment.
 */
export async function runGate(
  commands: string[] | undefined,
  label: string,
  options: RunCommandOptions,
): Promise<void> {
  if (!commands?.length) return;

  log.heading(`${label} (${commands.length})`);

  for (const command of commands) {
    if (options.dryRun) {
      log.dryRun(`$ ${command}`);
      continue;
    }

    log.step(`$ ${command}`);
    const code = await execute(command, options);

    if (code !== 0) {
      throw new DeployPilotError(`${label} failed: \`${command}\` exited ${code}.`, {
        hint: "Fix the failure, or re-run with --force to deploy anyway.",
      });
    }
  }

  log.success(`${label} passed`);
}

/** Fire-and-report hooks. A hook failure never fails the deployment itself. */
export async function runHook(
  command: string | undefined,
  label: string,
  options: RunCommandOptions,
): Promise<void> {
  if (!command) return;

  if (options.dryRun) {
    log.dryRun(`hook ${label}: $ ${command}`);
    return;
  }

  try {
    const code = await execute(command, options);
    if (code !== 0) log.warn(`Hook ${label} exited ${code}.`);
  } catch (error) {
    log.warn(
      `Hook ${label} could not run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
