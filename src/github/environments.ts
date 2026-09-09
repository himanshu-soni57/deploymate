import type { GitHubClient } from "./client";
import type { Deployment, DeploymentStatus, Environment } from "./types";

export class EnvironmentsApi {
  constructor(private readonly client: GitHubClient) {}

  private get base(): string {
    const { owner, repo } = this.client.repo;
    return `/repos/${owner}/${repo}`;
  }

  async list(): Promise<Environment[]> {
    const payload = await this.client.request<{ environments: Environment[] }>(
      `${this.base}/environments`,
      { allow404: true },
    );
    return payload?.environments ?? [];
  }

  async listDeployments(environment?: string, limit = 20): Promise<Deployment[]> {
    return (
      (await this.client.request<Deployment[]>(`${this.base}/deployments`, {
        allow404: true,
        query: { environment, per_page: limit },
      })) ?? []
    );
  }

  async latestStatus(deploymentId: number): Promise<DeploymentStatus | null> {
    const statuses = await this.client.request<DeploymentStatus[]>(
      `${this.base}/deployments/${deploymentId}/statuses`,
      { allow404: true, query: { per_page: 1 } },
    );
    return statuses?.[0] ?? null;
  }
}
