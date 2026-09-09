import { describe, expect, test } from "bun:test";
import {
  bump,
  compareSemver,
  formatSemver,
  maxSemver,
  parseSemver,
} from "../../src/versioning/semver";

describe("parseSemver", () => {
  test("parses core, prerelease and build", () => {
    expect(parseSemver("1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("1.2.3-rc.1")?.prerelease).toEqual(["rc", "1"]);
    expect(parseSemver("1.2.3+build.5")?.build).toBe("build.5");
  });

  test("rejects non-semver strings", () => {
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("20260908-141530")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });
});

describe("compareSemver", () => {
  const of = (value: string) => parseSemver(value)!;

  test("orders by major, minor, patch", () => {
    expect(compareSemver(of("1.0.0"), of("2.0.0"))).toBeLessThan(0);
    expect(compareSemver(of("1.2.0"), of("1.1.9"))).toBeGreaterThan(0);
  });

  test("a prerelease sorts before its release", () => {
    expect(compareSemver(of("1.0.0-rc.1"), of("1.0.0"))).toBeLessThan(0);
  });

  test("numeric prerelease identifiers compare numerically", () => {
    expect(compareSemver(of("1.0.0-rc.2"), of("1.0.0-rc.10"))).toBeLessThan(0);
  });

  test("maxSemver picks the highest", () => {
    const versions = ["1.0.0", "1.10.0", "1.2.0"].map(of);
    expect(formatSemver(maxSemver(versions)!)).toBe("1.10.0");
  });
});

describe("bump", () => {
  const of = (value: string) => parseSemver(value)!;
  const next = (value: string, type: Parameters<typeof bump>[1]) =>
    formatSemver(bump(of(value), type));

  test("bumps each level and resets the lower ones", () => {
    expect(next("1.2.3", "patch")).toBe("1.2.4");
    expect(next("1.2.3", "minor")).toBe("1.3.0");
    expect(next("1.2.3", "major")).toBe("2.0.0");
  });

  test("patch on a prerelease promotes it to the stable release", () => {
    expect(next("1.2.3-rc.1", "patch")).toBe("1.2.3");
  });

  test("prerelease increments the trailing counter", () => {
    expect(next("1.2.3-rc.1", "prerelease")).toBe("1.2.3-rc.2");
    expect(next("1.2.3", "prerelease")).toBe("1.2.4-rc.0");
  });
});
