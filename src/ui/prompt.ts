import { isCancel } from "@clack/prompts";
import { CancelledError } from "../errors";

/**
 * Unwraps a clack prompt result, converting cancellation into a thrown
 * CancelledError so the exit path lives in one place (exit 130) rather than
 * being fired by process.exit() calls scattered through leaf prompts.
 */
export function unwrap<T>(result: T | symbol): T {
  if (isCancel(result)) throw new CancelledError();
  return result as T;
}
