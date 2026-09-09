import { confirm, text } from "@clack/prompts";
import pc from "picocolors";
import { CancelledError } from "../errors";
import { unwrap } from "../ui/prompt";
import type { ConfirmMode } from "../config";

export async function confirmOrThrow(
  message: string,
  interactive: boolean,
  autoApprove: boolean,
): Promise<void> {
  if (autoApprove || !interactive) return;

  const answer = unwrap(await confirm({ message, initialValue: false }));
  if (!answer) throw new CancelledError("Deployment cancelled.");
}

/**
 * Extra friction for production. `type-name` makes the user retype the target
 * so a muscle-memory Enter cannot ship to prod.
 */
export async function gate(
  mode: ConfirmMode | undefined,
  target: string,
  interactive: boolean,
  autoApprove: boolean,
): Promise<void> {
  if (mode === "none" || autoApprove) return;

  if (!interactive) {
    if (mode === "type-name") {
      throw new CancelledError(
        `'${target}' requires typed confirmation, which needs an interactive terminal. Pass --yes to override.`,
      );
    }
    return;
  }

  if (mode === "type-name") {
    const typed = unwrap(
      await text({
        message: `Type ${pc.bold(target)} to confirm this deployment`,
        placeholder: target,
        validate: (value = "") =>
          value.trim() === target ? undefined : `Type exactly: ${target}`,
      }),
    );
    if (typed.trim() !== target) throw new CancelledError("Deployment cancelled.");
    return;
  }

  await confirmOrThrow(`Proceed with deployment to ${target}?`, interactive, false);
}
