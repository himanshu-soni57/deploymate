import { confirm, text } from "@clack/prompts";
import pc from "picocolors";
import { CancelledError } from "../errors";
import { unwrap } from "../ui/prompt";
import type { ConfirmMode } from "../config";

/**
 * The deployment gate answers Yes on Enter. Reaching it already means the user
 * ran `deploy`, chose a workflow, and cleared preflight, so the prompt is a
 * last look rather than a question. Destructive and irreversible prompts
 * elsewhere (the credential guard, file overwrites, run cancellation) keep
 * their No default, and production should use `confirmWith: "type-name"`.
 */
export const DEPLOY_CONFIRM_DEFAULT = true;

export async function confirmOrThrow(
  message: string,
  interactive: boolean,
  autoApprove: boolean,
  initialValue: boolean = DEPLOY_CONFIRM_DEFAULT,
): Promise<void> {
  if (autoApprove || !interactive) return;

  const answer = unwrap(await confirm({ message, initialValue }));
  if (!answer) throw new CancelledError("Deployment cancelled.");
}

/**
 * Extra friction for production. `type-name` makes the user retype the target,
 * so an Enter that now means "yes" still cannot ship to prod by itself.
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
