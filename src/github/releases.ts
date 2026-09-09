import type { GitHubClient } from "./client";
import type { Release } from "./types";

export interface CreateReleaseOptions {
  tag: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
  generateNotes?: boolean;
}

export class ReleasesApi {
  constructor(private readonly client: GitHubClient) {}

  private get base(): string {
    const { owner, repo } = this.client.repo;
    return `/repos/${owner}/${repo}`;
  }

  async list(limit = 20): Promise<Release[]> {
    return (
      (await this.client.request<Release[]>(`${this.base}/releases`, {
        allow404: true,
        query: { per_page: limit },
      })) ?? []
    );
  }

  async getByTag(tag: string): Promise<Release | null> {
    return this.client.request<Release | null>(
      `${this.base}/releases/tags/${encodeURIComponent(tag)}`,
      { allow404: true },
    );
  }

  async create(options: CreateReleaseOptions): Promise<Release> {
    return this.client.request<Release>(`${this.base}/releases`, {
      method: "POST",
      body: {
        tag_name: options.tag,
        name: options.name ?? options.tag,
        body: options.body,
        draft: options.draft ?? false,
        prerelease: options.prerelease ?? false,
        target_commitish: options.targetCommitish,
        generate_release_notes: options.generateNotes ?? false,
      },
    });
  }
}
