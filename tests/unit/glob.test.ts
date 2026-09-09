import { describe, expect, test } from "bun:test";
import {
  globLiterals,
  globToRegExp,
  matchesAnyGlob,
  matchesGlob,
} from "../../src/utils/glob";

describe("globToRegExp", () => {
  test("* does not cross a path separator", () => {
    expect(matchesGlob("src/index.ts", "src/*")).toBe(true);
    expect(matchesGlob("src/deep/index.ts", "src/*")).toBe(false);
  });

  test("** crosses path separators", () => {
    expect(matchesGlob("src/deep/index.ts", "src/**")).toBe(true);
    expect(matchesGlob("a/b/c/d.ts", "**/*.ts")).toBe(true);
  });

  test("matches GitHub tag patterns", () => {
    expect(matchesGlob("prod-v1", "prod-v*")).toBe(true);
    expect(matchesGlob("v1.2.3", "v*.*.*")).toBe(true);
    expect(matchesGlob("v20260908-141530", "v*.*.*")).toBe(false);
  });

  test("? matches exactly one character", () => {
    expect(matchesGlob("v1", "v?")).toBe(true);
    expect(matchesGlob("v12", "v?")).toBe(false);
  });

  test("character classes work, including negation", () => {
    expect(matchesGlob("v1.0.0", "v[0-9].*.*")).toBe(true);
    expect(matchesGlob("vx.0.0", "v[0-9].*.*")).toBe(false);
    expect(matchesGlob("vx", "v[!0-9]")).toBe(true);
  });

  test("+ means one-or-more of the preceding character, as GitHub defines it", () => {
    expect(matchesGlob("v123", "v[0-9]+")).toBe(true);
    expect(matchesGlob("aab", "a+b")).toBe(true);
    expect(matchesGlob("b", "a+b")).toBe(false);
  });

  test("a + with nothing to quantify is treated as a literal, not a crash", () => {
    expect(() => globToRegExp("*+")).not.toThrow();
    expect(matchesGlob("+tag", "+tag")).toBe(true);
  });

  test("regex metacharacters in the pattern are escaped", () => {
    expect(matchesGlob("v1.2.3", "v1.2.3")).toBe(true);
    expect(matchesGlob("v1x2x3", "v1.2.3")).toBe(false);
  });

  test("matchesAnyGlob is an or across patterns", () => {
    expect(matchesAnyGlob("main", ["release/*", "main"])).toBe(true);
    expect(matchesAnyGlob("dev", ["release/*", "main"])).toBe(false);
  });
});

describe("globLiterals", () => {
  test("splits fixed text around the wildcard region", () => {
    expect(globLiterals("prod-v*")).toEqual({
      prefix: "prod-v",
      suffix: "",
      hasWildcard: true,
    });
    expect(globLiterals("v*.*.*-rc")).toEqual({
      prefix: "v",
      suffix: "-rc",
      hasWildcard: true,
    });
  });

  test("reports patterns with no wildcard", () => {
    expect(globLiterals("release")).toEqual({
      prefix: "release",
      suffix: "",
      hasWildcard: false,
    });
  });

  test("treats a character class as part of the wildcard region", () => {
    expect(globLiterals("v[0-9].x")).toEqual({
      prefix: "v",
      suffix: ".x",
      hasWildcard: true,
    });
  });
});
