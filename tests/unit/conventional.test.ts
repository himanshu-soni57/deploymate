import { describe, expect, test } from "bun:test";
import {
  buildChangelog,
  inferReleaseType,
  parseConventional,
} from "../../src/versioning/conventional";
import type { CommitSummary } from "../../src/types/git";

function commit(subject: string, body = "", author = "Ada"): CommitSummary {
  return {
    sha: "0".repeat(40),
    shortSha: "0000000",
    subject,
    body,
    author,
    date: "2026-09-08T00:00:00Z",
  };
}

describe("parseConventional", () => {
  test("parses type, scope and subject", () => {
    const parsed = parseConventional(commit("feat(api): add endpoint"))!;
    expect(parsed.type).toBe("feat");
    expect(parsed.scope).toBe("api");
    expect(parsed.subject).toBe("add endpoint");
    expect(parsed.breaking).toBe(false);
  });

  test("detects the ! breaking marker", () => {
    expect(parseConventional(commit("feat!: drop node 18"))!.breaking).toBe(true);
  });

  test("detects a BREAKING CHANGE footer", () => {
    expect(
      parseConventional(commit("fix: x", "BREAKING CHANGE: config moved"))!.breaking,
    ).toBe(true);
  });

  test("returns null for a non-conventional subject", () => {
    expect(parseConventional(commit("random change"))).toBeNull();
  });
});

describe("inferReleaseType", () => {
  test("breaking changes mean major", () => {
    expect(inferReleaseType([commit("feat!: x"), commit("fix: y")]).type).toBe(
      "major",
    );
  });

  test("features mean minor", () => {
    expect(inferReleaseType([commit("feat: x"), commit("fix: y")]).type).toBe(
      "minor",
    );
  });

  test("fixes alone mean patch", () => {
    expect(inferReleaseType([commit("fix: y")]).type).toBe("patch");
  });

  test("no conventional commits defaults to patch and says so", () => {
    const result = inferReleaseType([commit("whatever")]);
    expect(result.type).toBe("patch");
    expect(result.reason).toContain("no conventional commits");
  });
});

describe("buildChangelog", () => {
  test("groups by type and lists contributors", () => {
    const changelog = buildChangelog(
      [
        commit("feat(api): add endpoint", "", "Ada"),
        commit("fix: correct rounding", "", "Grace"),
        commit("chore: bump deps", "", "Ada"),
      ],
      { from: "v1.0.0", to: "v1.1.0" },
    );

    expect(changelog).toContain("### Features");
    expect(changelog).toContain("**api:** add endpoint");
    expect(changelog).toContain("### Bug Fixes");
    expect(changelog).toContain("### Contributors");
    expect(changelog).toContain("- Ada");
    expect(changelog).toContain("- Grace");
  });

  test("puts breaking changes first", () => {
    const changelog = buildChangelog([commit("feat!: drop node 18")], {
      from: null,
      to: "v2.0.0",
    });
    expect(changelog.startsWith("### BREAKING CHANGES")).toBe(true);
  });

  test("handles an empty range", () => {
    expect(buildChangelog([], { from: null, to: "v1.0.0" })).toBe("_No changes._");
  });
});
