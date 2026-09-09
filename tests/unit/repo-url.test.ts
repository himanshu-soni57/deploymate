import { describe, expect, test } from "bun:test";
import { parseRemoteUrl } from "../../src/github/repo-url";

describe("parseRemoteUrl", () => {
  const cases: [string, string, string][] = [
    ["git@github.com:owner/repo.git", "owner", "repo"],
    ["git@github.com:owner/repo", "owner", "repo"],
    ["ssh://git@github.com/owner/repo.git", "owner", "repo"],
    ["https://github.com/owner/repo.git", "owner", "repo"],
    ["https://github.com/owner/repo", "owner", "repo"],
    ["https://user:token@github.com/owner/repo.git", "owner", "repo"],
    ["https://github.com/owner/repo/", "owner", "repo"],
  ];

  for (const [url, owner, repo] of cases) {
    test(`parses ${url}`, () => {
      const parsed = parseRemoteUrl(url);
      expect(parsed?.owner).toBe(owner);
      expect(parsed?.repo).toBe(repo);
    });
  }

  test("uses the api.github.com base for github.com", () => {
    expect(parseRemoteUrl("git@github.com:o/r.git")?.apiBase).toBe(
      "https://api.github.com",
    );
  });

  test("uses the /api/v3 base for GitHub Enterprise", () => {
    const parsed = parseRemoteUrl("git@ghe.corp.com:team/service.git");
    expect(parsed?.apiBase).toBe("https://ghe.corp.com/api/v3");
    expect(parsed?.webBase).toBe("https://ghe.corp.com");
  });

  test("keeps a repository name that contains dots", () => {
    expect(parseRemoteUrl("git@github.com:owner/my.repo.git")?.repo).toBe("my.repo");
  });

  test("returns null for input it cannot parse", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("not a url")).toBeNull();
  });
});
