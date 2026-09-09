import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";
import { requireToken } from "./auth";
import type { RepoRef } from "./repo-url";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Return null instead of throwing when the API answers 404. */
  allow404?: boolean;
  accept?: string;
}

interface ApiErrorBody {
  message?: string;
  errors?: { message?: string; field?: string; code?: string }[];
  documentation_url?: string;
}

/**
 * Minimal GitHub REST client. Deliberately hand-rolled rather than Octokit:
 * DeployPilot uses roughly a dozen endpoints, and Octokit's dependency tree
 * would dominate CLI startup time.
 */
export class GitHubClient {
  constructor(
    readonly repo: RepoRef,
    private readonly dryRun = false,
  ) {}

  private async headers(accept: string): Promise<Record<string, string>> {
    const { token } = await requireToken();
    return {
      accept,
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "deploypilot",
    };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = new URL(`${this.repo.apiBase}${path}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const mutating = method !== "GET";

    if (mutating && this.dryRun) {
      log.dryRun(`${method} ${url.pathname}${url.search}`);
      if (options.body) log.dryRun(`  body: ${JSON.stringify(options.body)}`);
      return {} as T;
    }

    log.debug(`${method} ${url.toString()}`);

    const response = await fetch(url, {
      method,
      headers: {
        ...(await this.headers(options.accept ?? "application/vnd.github+json")),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 404 && options.allow404) {
      return null as T;
    }

    if (!response.ok) {
      throw await this.toError(response, method, url);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (!text) return undefined as T;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return text as T;

    return JSON.parse(text) as T;
  }

  /** Follows the API's redirect to a plain-text or zip artifact. */
  async requestRaw(path: string): Promise<Response> {
    const url = new URL(`${this.repo.apiBase}${path}`);
    return fetch(url, {
      headers: await this.headers("application/vnd.github+json"),
      redirect: "follow",
    });
  }

  /** Walks `page` until fewer than `perPage` items come back. */
  async paginate<T>(
    path: string,
    options: RequestOptions & { perPage?: number; max?: number } = {},
    extract: (payload: unknown) => T[] = (payload) => payload as T[],
  ): Promise<T[]> {
    const perPage = options.perPage ?? 100;
    const max = options.max ?? 300;
    const results: T[] = [];

    for (let page = 1; results.length < max; page++) {
      const payload = await this.request<unknown>(path, {
        ...options,
        query: { ...options.query, per_page: perPage, page },
      });

      const batch = extract(payload);
      if (!batch.length) break;

      results.push(...batch);
      if (batch.length < perPage) break;
    }

    return results.slice(0, max);
  }

  private async toError(
    response: Response,
    method: string,
    url: URL,
  ): Promise<DeployPilotError> {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body; the status alone will have to do.
    }

    const detail = body.errors?.map((entry) => entry.message).filter(Boolean).join("; ");
    const message = [body.message, detail].filter(Boolean).join(" - ");
    const summary = `GitHub API ${response.status} on ${method} ${url.pathname}${
      message ? `: ${message}` : ""
    }`;

    const hints: Record<number, string> = {
      401:
        "The token was rejected. Refresh it with `gh auth login`, or check that\n" +
        "GITHUB_TOKEN / DEPLOYPILOT_TOKEN is not expired.",
      403:
        response.headers.get("x-ratelimit-remaining") === "0"
          ? `Rate limit exhausted. Resets at ${new Date(
              Number(response.headers.get("x-ratelimit-reset") ?? 0) * 1000,
            ).toLocaleTimeString()}.`
          : "The token lacks permission. Deploy commands need the `repo` and `workflow` scopes.",
      404:
        "Either the resource does not exist or the token cannot see it.\n" +
        "For workflow_dispatch: the workflow file must exist on the repository's\n" +
        "default branch, and must declare `workflow_dispatch:` there.",
      422: "GitHub rejected the request payload. Check input names and the target ref.",
    };

    return new DeployPilotError(summary, { hint: hints[response.status] });
  }
}
