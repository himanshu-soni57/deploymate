import { DeployPilotError } from "../errors";

export interface RepoRef {
  host: string;
  owner: string;
  repo: string;
  /** REST base for github.com vs. GitHub Enterprise Server. */
  apiBase: string;
  webBase: string;
}

const SSH_LIKE = /^(?:ssh:\/\/)?(?:[^@]+@)?([^:/]+)[:/](.+?)(?:\.git)?\/?$/;
const HTTP_LIKE = /^https?:\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/;

/**
 * Parses the many shapes a git remote can take:
 *   git@github.com:owner/repo.git
 *   ssh://git@github.com/owner/repo.git
 *   https://github.com/owner/repo.git
 *   https://user:token@ghe.corp.com/owner/repo
 */
export function parseRemoteUrl(url: string): RepoRef | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const match = HTTP_LIKE.exec(trimmed) ?? SSH_LIKE.exec(trimmed);
  if (!match) return null;

  const host = match[1]!.replace(/:\d+$/, "");
  const segments = match[2]!.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[segments.length - 2]!;
  const repo = segments[segments.length - 1]!.replace(/\.git$/, "");
  const isDotCom = host === "github.com" || host === "www.github.com";

  return {
    host,
    owner,
    repo,
    apiBase: isDotCom ? "https://api.github.com" : `https://${host}/api/v3`,
    webBase: isDotCom ? "https://github.com" : `https://${host}`,
  };
}

export function requireRepoRef(url: string | null): RepoRef {
  const parsed = url ? parseRemoteUrl(url) : null;

  if (!parsed) {
    throw new DeployPilotError(
      "Could not determine the GitHub repository from the git remote.",
      {
        hint:
          "Add a remote and try again:\n" +
          "  git remote add origin git@github.com:owner/repo.git",
      },
    );
  }

  return parsed;
}
