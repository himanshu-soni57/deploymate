import { describe, expect, test } from "bun:test";
import {
  analyzePattern,
  suggestTags,
  validateTagAgainstPattern,
} from "../../src/versioning/suggest";
import { globToRegExp } from "../../src/utils/glob";

const NOW = new Date("2026-09-08T14:15:30");

describe("analyzePattern", () => {
  test("detects semver from the pattern shape", () => {
    expect(analyzePattern("v*.*.*", []).scheme).toBe("semver");
    expect(analyzePattern("*.*.*", []).scheme).toBe("semver");
  });

  test("detects semver from tag history when the pattern is loose", () => {
    const analysis = analyzePattern("prod-v*", [
      "prod-v1.2.3",
      "prod-v1.2.2",
      "prod-v1.1.0",
    ]);
    expect(analysis.scheme).toBe("semver");
    expect(analysis.latest).toBe("prod-v1.2.3");
  });

  test("falls back to timestamps when history is not semver", () => {
    const analysis = analyzePattern("prod-v*", [
      "prod-v20260101-000000",
      "prod-v20260102-000000",
    ]);
    expect(analysis.scheme).toBe("timestamp");
  });

  test("ignores tags that do not match the pattern", () => {
    const analysis = analyzePattern("prod-v*", ["v1.0.0", "prod-v2.0.0"]);
    expect(analysis.matching).toEqual(["prod-v2.0.0"]);
  });

  test("treats a wildcard-free pattern as a literal tag", () => {
    expect(analyzePattern("release", []).scheme).toBe("literal");
  });
});

describe("suggestTags", () => {
  test("every suggestion satisfies the pattern it was built for", () => {
    for (const pattern of ["v*.*.*", "prod-v*", "release/*", "v*.*.*-rc"]) {
      const analysis = analyzePattern(pattern, []);
      for (const suggestion of suggestTags(analysis, { now: NOW })) {
        expect(globToRegExp(pattern).test(suggestion.tag)).toBe(true);
      }
    }
  });

  test("a semver pattern never yields a timestamp tag", () => {
    // The old generator produced `v20260908-141530` for `v*.*.*`, a tag that
    // could never trigger the workflow it was generated for.
    const analysis = analyzePattern("v*.*.*", ["v1.0.0"]);
    const tags = suggestTags(analysis, { now: NOW }).map((entry) => entry.tag);

    expect(tags).toContain("v1.0.1");
    expect(tags).toContain("v1.1.0");
    expect(tags).toContain("v2.0.0");
    expect(tags.some((tag) => tag.includes("20260908"))).toBe(false);
  });

  test("bumps from the newest matching tag, not the newest overall", () => {
    const analysis = analyzePattern("prod-v*", [
      "prod-v1.9.0",
      "prod-v1.10.0",
      "v4.0.0",
    ]);
    const tags = suggestTags(analysis, { now: NOW }).map((entry) => entry.tag);
    expect(tags).toContain("prod-v1.10.1");
  });

  test("marks the inferred release type as recommended", () => {
    const analysis = analyzePattern("v*.*.*", ["v1.0.0"]);
    const suggestions = suggestTags(analysis, {
      now: NOW,
      inferred: { type: "minor", reason: "2 feat commits" },
    });
    const recommended = suggestions.find((entry) =>
      entry.label.includes("(recommended)"),
    );
    expect(recommended?.tag).toBe("v1.1.0");
  });

  test("produces a timestamp tag for a loose prefix pattern", () => {
    const analysis = analyzePattern("prod-v*", []);
    const tags = suggestTags(analysis, { now: NOW }).map((entry) => entry.tag);
    expect(tags).toContain("prod-v20260908-141530");
  });

  test("respects a suffix after the wildcard", () => {
    const analysis = analyzePattern("v*-rc", []);
    for (const suggestion of suggestTags(analysis, { now: NOW })) {
      expect(suggestion.tag.startsWith("v")).toBe(true);
      expect(suggestion.tag.endsWith("-rc")).toBe(true);
    }
  });

  test("calver sequence advances past existing tags in the same month", () => {
    const analysis = analyzePattern("r-*", ["r-2026.09.1", "r-2026.09.2"]);
    const tags = suggestTags(analysis, { now: NOW }).map((entry) => entry.tag);
    expect(tags).toContain("r-2026.09.3");
  });
});

describe("validateTagAgainstPattern", () => {
  test("accepts a matching tag", () => {
    expect(validateTagAgainstPattern("prod-v1.0.0", "prod-v*").valid).toBe(true);
  });

  test("rejects a tag the workflow would ignore", () => {
    const result = validateTagAgainstPattern("v1.0.0", "prod-v*");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("would not trigger");
  });

  test("rejects invalid git ref names", () => {
    expect(validateTagAgainstPattern("has space", "*").valid).toBe(false);
    expect(validateTagAgainstPattern("a..b", "*").valid).toBe(false);
    expect(validateTagAgainstPattern("", "*").valid).toBe(false);
  });
});
