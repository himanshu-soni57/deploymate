export interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string | null;
}

const SEMVER =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseSemver(value: string): Semver | null {
  const match = SEMVER.exec(value.trim());
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
    build: match[5] ?? null,
  };
}

export function formatSemver(version: Semver): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  const pre = version.prerelease.length ? `-${version.prerelease.join(".")}` : "";
  const build = version.build ? `+${version.build}` : "";
  return `${core}${pre}${build}`;
}

function comparePrerelease(a: string[], b: string[]): number {
  // Per spec: a version WITH a prerelease sorts before one without.
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;

  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    const left = a[index];
    const right = b[index];

    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
      continue;
    }

    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (left !== right) return left < right ? -1 : 1;
  }

  return 0;
}

export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

export type ReleaseType = "major" | "minor" | "patch" | "prerelease";

export function bump(
  version: Semver,
  type: ReleaseType,
  preid = "rc",
): Semver {
  switch (type) {
    case "major":
      return { major: version.major + 1, minor: 0, patch: 0, prerelease: [], build: null };
    case "minor":
      return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: [], build: null };
    case "patch":
      // Bumping patch on a prerelease promotes it to the stable release.
      if (version.prerelease.length) {
        return { ...version, prerelease: [], build: null };
      }
      return { ...version, patch: version.patch + 1, prerelease: [], build: null };
    case "prerelease": {
      if (version.prerelease.length) {
        const parts = [...version.prerelease];
        const lastIndex = parts.length - 1;
        const last = parts[lastIndex]!;
        if (/^\d+$/.test(last)) {
          parts[lastIndex] = String(Number(last) + 1);
        } else {
          parts.push("0");
        }
        return { ...version, prerelease: parts, build: null };
      }
      return {
        ...version,
        patch: version.patch + 1,
        prerelease: [preid, "0"],
        build: null,
      };
    }
  }
}

export function maxSemver(versions: Semver[]): Semver | null {
  if (!versions.length) return null;
  return versions.reduce((best, current) =>
    compareSemver(current, best) > 0 ? current : best,
  );
}
