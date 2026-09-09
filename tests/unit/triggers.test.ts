import { describe, expect, test } from "bun:test";
import {
  evaluateBranchPush,
  evaluateTagPush,
  pathsMatch,
  refMatches,
} from "../../src/workflow/triggers";

describe("refMatches", () => {
  test("an empty include list means any ref", () => {
    expect(refMatches("anything", [], undefined)).toBe(true);
    expect(refMatches("anything", undefined, undefined)).toBe(true);
  });

  test("ignore wins over include", () => {
    expect(refMatches("wip/x", ["**"], ["wip/**"])).toBe(false);
  });
});

describe("pathsMatch", () => {
  test("no filters means always match", () => {
    expect(pathsMatch(["a.ts"], undefined, undefined)).toBe(true);
  });

  test("include requires at least one matching file", () => {
    expect(pathsMatch(["src/a.ts"], ["src/**"], undefined)).toBe(true);
    expect(pathsMatch(["docs/a.md"], ["src/**"], undefined)).toBe(false);
  });

  test("paths-ignore excludes files before the include check", () => {
    expect(pathsMatch(["docs/a.md"], undefined, ["docs/**"])).toBe(false);
    expect(pathsMatch(["docs/a.md", "src/b.ts"], undefined, ["docs/**"])).toBe(true);
  });
});

describe("evaluateBranchPush", () => {
  test("accepts a matching branch", () => {
    expect(
      evaluateBranchPush({ branches: ["main"] }, "main", ["src/a.ts"]).triggers,
    ).toBe(true);
  });

  test("rejects a branch the filter excludes and says why", () => {
    const verdict = evaluateBranchPush({ branches: ["main"] }, "dev", ["a.ts"]);
    expect(verdict.triggers).toBe(false);
    expect(verdict.reason).toContain("does not match branches");
  });

  test("rejects a push whose files all fall outside the paths filter", () => {
    // The old planner ignored `paths:` entirely and reported success for this.
    const verdict = evaluateBranchPush(
      { branches: ["main"], paths: ["src/**"] },
      "main",
      ["README.md"],
    );
    expect(verdict.triggers).toBe(false);
    expect(verdict.reason).toContain("paths");
  });

  test("honours branches-ignore", () => {
    const verdict = evaluateBranchPush(
      { "branches-ignore": ["wip/**"] },
      "wip/thing",
      ["a.ts"],
    );
    expect(verdict.triggers).toBe(false);
  });
});

describe("evaluateTagPush", () => {
  test("accepts a matching tag", () => {
    expect(evaluateTagPush({ tags: ["prod-v*"] }, "prod-v1").triggers).toBe(true);
  });

  test("rejects a tag outside the filter", () => {
    const verdict = evaluateTagPush({ tags: ["prod-v*"] }, "v1.0.0");
    expect(verdict.triggers).toBe(false);
    expect(verdict.reason).toContain("does not match tags");
  });

  test("honours tags-ignore", () => {
    expect(
      evaluateTagPush({ tags: ["v*"], "tags-ignore": ["v*-rc"] }, "v1.0.0-rc")
        .triggers,
    ).toBe(false);
  });
});
