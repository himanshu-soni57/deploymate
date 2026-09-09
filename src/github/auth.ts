import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";

const run = promisify(execFile);

export type TokenSource =
  | "DEPLOYPILOT_TOKEN"
  | "GH_TOKEN"
  | "GITHUB_TOKEN"
  | "gh-cli"
  | "none";

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

let cached: ResolvedToken | null = null;

async function fromGhCli(): Promise<string | null> {
  try {
    const { stdout } = await run("gh", ["auth", "token"], { timeout: 5000 });
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Resolution order: explicit env var, generic GitHub env vars, then the
 * GitHub CLI (which most developers already have authenticated, making
 * DeployPilot zero-setup for them).
 */
export async function resolveToken(): Promise<ResolvedToken | null> {
  if (cached) return cached;

  const env: [TokenSource, string | undefined][] = [
    ["DEPLOYPILOT_TOKEN", process.env.DEPLOYPILOT_TOKEN],
    ["GH_TOKEN", process.env.GH_TOKEN],
    ["GITHUB_TOKEN", process.env.GITHUB_TOKEN],
  ];

  for (const [source, value] of env) {
    if (value?.trim()) {
      cached = { token: value.trim(), source };
      log.debug(`GitHub token resolved from ${source}`);
      return cached;
    }
  }

  const cli = await fromGhCli();
  if (cli) {
    cached = { token: cli, source: "gh-cli" };
    log.debug("GitHub token resolved from `gh auth token`");
    return cached;
  }

  return null;
}

export async function requireToken(): Promise<ResolvedToken> {
  const resolved = await resolveToken();

  if (!resolved) {
    throw new DeployPilotError("No GitHub token available.", {
      hint:
        "DeployPilot needs API access for this command. Pick one:\n" +
        "  gh auth login                     (recommended, reused automatically)\n" +
        "  export GITHUB_TOKEN=ghp_xxx       (needs `repo` + `workflow` scopes)\n" +
        "  export DEPLOYPILOT_TOKEN=ghp_xxx  (takes priority over the above)",
    });
  }

  return resolved;
}

/** Test seam. */
export function resetTokenCache(): void {
  cached = null;
}
