import { log } from "../ui/logger";

interface Undo {
  label: string;
  run: () => Promise<void>;
}

/**
 * Records every local mutation so a failed deployment can be unwound instead
 * of leaving the repository half-deployed (the classic symptom being a local
 * tag left behind after a rejected push, which then blocks the next attempt).
 */
export class Transaction {
  private readonly undos: Undo[] = [];
  private readonly done: string[] = [];

  record(label: string, undo: () => Promise<void>): void {
    this.undos.push({ label, run: undo });
    this.done.push(label);
  }

  get performed(): readonly string[] {
    return this.done;
  }

  get isEmpty(): boolean {
    return this.undos.length === 0;
  }

  /** Unwinds in reverse order, continuing past individual failures. */
  async rollback(): Promise<{ undone: string[]; failed: string[] }> {
    const undone: string[] = [];
    const failed: string[] = [];

    for (const entry of [...this.undos].reverse()) {
      try {
        await entry.run();
        undone.push(entry.label);
        log.success(`Undid: ${entry.label}`);
      } catch (error) {
        failed.push(entry.label);
        log.warn(
          `Could not undo '${entry.label}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.undos.length = 0;
    return { undone, failed };
  }

  /** Marks the work as committed; nothing will be rolled back afterwards. */
  seal(): void {
    this.undos.length = 0;
  }
}
