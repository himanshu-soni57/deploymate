import { spinner } from "@clack/prompts";
import { log } from "./logger";

export interface Spinner {
  start(message: string): void;
  stop(message?: string): void;
  message(message: string): void;
}

class PlainSpinner implements Spinner {
  start(message: string): void {
    log.step(message);
  }
  stop(message?: string): void {
    if (message) log.success(message);
  }
  message(message: string): void {
    log.step(message);
  }
}

/**
 * Clack spinners require a TTY. Fall back to plain lines in CI, when output is
 * piped, or when JSON output is requested.
 */
export function createSpinner(interactive: boolean): Spinner {
  return interactive ? (spinner() as Spinner) : new PlainSpinner();
}
