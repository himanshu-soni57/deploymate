import type { GitHubClient } from "./client";

interface NamedEntry {
  name: string;
}

/** Secret and variable NAMES only. Values are never fetched or printed. */
export class SecretsApi {
  constructor(private readonly client: GitHubClient) {}

  private get base(): string {
    const { owner, repo } = this.client.repo;
    return `/repos/${owner}/${repo}`;
  }

  async listSecretNames(): Promise<string[]> {
    const payload = await this.client.request<{ secrets: NamedEntry[] }>(
      `${this.base}/actions/secrets`,
      { allow404: true, query: { per_page: 100 } },
    );
    return (payload?.secrets ?? []).map((entry) => entry.name);
  }

  async listVariableNames(): Promise<string[]> {
    const payload = await this.client.request<{ variables: NamedEntry[] }>(
      `${this.base}/actions/variables`,
      { allow404: true, query: { per_page: 100 } },
    );
    return (payload?.variables ?? []).map((entry) => entry.name);
  }

  async listEnvironmentSecretNames(environment: string): Promise<string[]> {
    const payload = await this.client.request<{ secrets: NamedEntry[] }>(
      `${this.base}/environments/${encodeURIComponent(environment)}/secrets`,
      { allow404: true, query: { per_page: 100 } },
    );
    return (payload?.secrets ?? []).map((entry) => entry.name);
  }
}
