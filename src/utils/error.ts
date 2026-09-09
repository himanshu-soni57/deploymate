import pc from "picocolors";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";

export function handleError(error: unknown): never {
  if (error instanceof DeployPilotError) {
    if (error.exitCode === 130) {
      console.error();
      console.error(pc.yellow(error.message));
      process.exit(error.exitCode);
    }

    console.error();
    console.error(`${pc.red("x")} ${error.message}`);

    if (error.hint) {
      console.error();
      console.error(pc.cyan("Hint:"));
      for (const line of error.hint.split("\n")) {
        console.error(`  ${line}`);
      }
    }

    process.exit(error.exitCode);
  }

  console.error();

  if (error instanceof Error) {
    console.error(`${pc.red("x")} ${error.message}`);
    if (log.level === "verbose" && error.stack) {
      console.error(pc.dim(error.stack));
    }
    process.exit(1);
  }

  console.error(`${pc.red("x")} Unknown error: ${String(error)}`);
  process.exit(1);
}
