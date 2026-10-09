import { beforeEach, describe, expect, mock, test } from "bun:test";

interface ConfirmOptions {
  message: string;
  initialValue?: boolean;
}

let lastConfirm: ConfirmOptions | null = null;
let confirmCalls = 0;
let answer = true;

let lastTextMessage: string | null = null;
let typed = "";

mock.module("@clack/prompts", () => ({
  confirm: async (options: ConfirmOptions) => {
    confirmCalls++;
    lastConfirm = options;
    return answer;
  },
  text: async (options: { message: string }) => {
    lastTextMessage = options.message;
    return typed;
  },
  isCancel: () => false,
  cancel: () => {},
}));

const { confirmOrThrow, gate, DEPLOY_CONFIRM_DEFAULT } = await import(
  "../../src/prompts/confirm"
);
const { CancelledError } = await import("../../src/errors");

beforeEach(() => {
  lastConfirm = null;
  lastTextMessage = null;
  confirmCalls = 0;
  answer = true;
  typed = "";
});

describe("deployment confirmation default", () => {
  test("Enter means yes", () => {
    expect(DEPLOY_CONFIRM_DEFAULT).toBe(true);
  });

  test("confirmOrThrow preselects yes", async () => {
    await confirmOrThrow("Proceed?", true, false);
    expect(lastConfirm?.initialValue).toBe(true);
  });

  test("a caller can still ask for a no default", async () => {
    await confirmOrThrow("Dangerous?", true, false, false);
    expect(lastConfirm?.initialValue).toBe(false);
  });

  test("answering no cancels with exit code 130", async () => {
    answer = false;
    const failure = await confirmOrThrow("Proceed?", true, false).catch((error) => error);
    expect(failure).toBeInstanceOf(CancelledError);
    expect((failure as InstanceType<typeof CancelledError>).exitCode).toBe(130);
  });
});

describe("gate", () => {
  test("confirm mode prompts with yes preselected and names the target", async () => {
    await gate("confirm", "production", true, false);
    expect(confirmCalls).toBe(1);
    expect(lastConfirm?.initialValue).toBe(true);
    expect(lastConfirm?.message).toContain("production");
  });

  test("none mode never prompts", async () => {
    await gate("none", "staging", true, false);
    expect(confirmCalls).toBe(0);
  });

  test("--yes never prompts", async () => {
    await gate("confirm", "staging", true, true);
    expect(confirmCalls).toBe(0);
  });

  test("a non-interactive confirm passes without prompting", async () => {
    await gate("confirm", "staging", false, false);
    expect(confirmCalls).toBe(0);
  });

  test("type-name still demands the typed target, not an Enter", async () => {
    typed = "production";
    await gate("type-name", "production", true, false);
    expect(confirmCalls).toBe(0);
    expect(lastTextMessage).toContain("production");
  });

  test("type-name rejects a wrong answer", async () => {
    typed = "prod";
    const failure = await gate("type-name", "production", true, false).catch(
      (error) => error,
    );
    expect(failure).toBeInstanceOf(CancelledError);
  });

  test("type-name cannot be satisfied without a terminal", async () => {
    const failure = await gate("type-name", "production", false, false).catch(
      (error) => error,
    );
    expect(failure).toBeInstanceOf(CancelledError);
    expect((failure as Error).message).toContain("--yes");
  });
});
