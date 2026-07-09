import pc from "picocolors";
import { DeployMateError } from "../errors/DeployMateError";

export function handleError(error: unknown): never {
  console.error();

  if (error instanceof DeployMateError) {
    console.error(pc.red("✖"), error.message);

    if (error.hint) {
      console.log();
      console.log(pc.cyan("Hint:"));
      console.log(error.hint);
    }

    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(pc.red("✖"), error.message);
    process.exit(1);
  }

  console.error(pc.red("✖"), "Unknown error");
  process.exit(1);
}
