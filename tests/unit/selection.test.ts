import { describe, expect, test } from "bun:test";
import {
  findRiskyPaths,
  selectionFromFlags,
} from "../../src/core/selection";
import { DEFAULT_PROTECTED_PATHS } from "../../src/config/defaults";
import type { FileChange } from "../../src/types/git";

function change(path: string, staged = false): FileChange {
  return {
    path,
    index: staged ? "M" : " ",
    worktree: staged ? " " : "M",
    kind: "modified",
    staged,
    unstaged: !staged,
  };
}

const CHANGES = [
  change("src/a.ts", true),
  change("src/b.ts"),
  change("docs/c.md"),
];

describe("selectionFromFlags", () => {
  test("returns null when no staging flag was given", () => {
    expect(selectionFromFlags(CHANGES, {}, [])).toBeNull();
  });

  test("--all selects every change", () => {
    const selection = selectionFromFlags(CHANGES, { all: true }, [])!;
    expect(selection.mode).toBe("all");
    expect(selection.paths).toHaveLength(3);
    expect(selection.leftBehind).toHaveLength(0);
  });

  test("--no-commit selects nothing and leaves everything behind", () => {
    const selection = selectionFromFlags(CHANGES, { noCommit: true }, [])!;
    expect(selection.mode).toBe("none");
    expect(selection.paths).toHaveLength(0);
    expect(selection.leftBehind).toHaveLength(3);
  });

  test("--staged uses only the index", () => {
    const selection = selectionFromFlags(CHANGES, { staged: true }, [])!;
    expect(selection.paths).toEqual(["src/a.ts"]);
    expect(selection.leftBehind.map((entry) => entry.path)).toEqual([
      "src/b.ts",
      "docs/c.md",
    ]);
  });

  test("--staged with an empty index is an error", () => {
    expect(() =>
      selectionFromFlags([change("src/b.ts")], { staged: true }, []),
    ).toThrow(/index is empty/);
  });

  test("--file accepts exact paths and reports what is left behind", () => {
    const selection = selectionFromFlags(CHANGES, { file: ["src/b.ts"] }, [])!;
    expect(selection.mode).toBe("paths");
    expect(selection.paths).toEqual(["src/b.ts"]);
    expect(selection.leftBehind).toHaveLength(2);
  });

  test("--file accepts globs", () => {
    const selection = selectionFromFlags(CHANGES, { file: ["src/*.ts"] }, [])!;
    expect(selection.paths.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("--file that matches nothing is an error", () => {
    expect(() => selectionFromFlags(CHANGES, { file: ["nope.ts"] }, [])).toThrow(
      /matched none/,
    );
  });

  test("combining staging modes is rejected", () => {
    expect(() => selectionFromFlags(CHANGES, { all: true, staged: true }, [])).toThrow(
      /Pick one staging mode/,
    );
  });

  test("flags credential-shaped files inside the selection", () => {
    const withSecret = [...CHANGES, change(".env")];
    const selection = selectionFromFlags(
      withSecret,
      { all: true },
      DEFAULT_PROTECTED_PATHS,
    )!;
    expect(selection.risky).toEqual([".env"]);
  });
});

describe("findRiskyPaths", () => {
  test("matches the default protected patterns", () => {
    const risky = findRiskyPaths(
      [".env", ".env.production", "app/.env", "key.pem", "src/index.ts"],
      DEFAULT_PROTECTED_PATHS,
    );
    expect(risky).toEqual([".env", ".env.production", "app/.env", "key.pem"]);
  });
});
