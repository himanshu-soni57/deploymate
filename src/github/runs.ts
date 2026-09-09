import type { GitHubClient } from "./client";
import type {
  RepoWorkflow,
  WorkflowJob,
  WorkflowRun,
} from "./types";

interface RunsPayload {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

interface JobsPayload {
  total_count: number;
  jobs: WorkflowJob[];
}

export class RunsApi {
  constructor(private readonly client: GitHubClient) {}

  private get base(): string {
    const { owner, repo } = this.client.repo;
    return `/repos/${owner}/${repo}`;
  }

  async listWorkflows(): Promise<RepoWorkflow[]> {
    const payload = await this.client.request<{ workflows: RepoWorkflow[] }>(
      `${this.base}/actions/workflows`,
      { query: { per_page: 100 } },
    );
    return payload?.workflows ?? [];
  }

  async listRuns(options: {
    workflowFile?: string;
    branch?: string;
    event?: string;
    status?: string;
    headSha?: string;
    limit?: number;
  } = {}): Promise<WorkflowRun[]> {
    const path = options.workflowFile
      ? `${this.base}/actions/workflows/${encodeURIComponent(options.workflowFile)}/runs`
      : `${this.base}/actions/runs`;

    const payload = await this.client.request<RunsPayload>(path, {
      allow404: true,
      query: {
        branch: options.branch,
        event: options.event,
        status: options.status,
        head_sha: options.headSha,
        per_page: options.limit ?? 20,
      },
    });

    return payload?.workflow_runs ?? [];
  }

  async getRun(runId: number): Promise<WorkflowRun> {
    return this.client.request<WorkflowRun>(`${this.base}/actions/runs/${runId}`);
  }

  async listJobs(runId: number): Promise<WorkflowJob[]> {
    const payload = await this.client.request<JobsPayload>(
      `${this.base}/actions/runs/${runId}/jobs`,
      { query: { per_page: 100 } },
    );
    return payload?.jobs ?? [];
  }

  async cancelRun(runId: number): Promise<void> {
    await this.client.request(`${this.base}/actions/runs/${runId}/cancel`, {
      method: "POST",
    });
  }

  async rerun(runId: number, failedOnly = false): Promise<void> {
    const suffix = failedOnly ? "rerun-failed-jobs" : "rerun";
    await this.client.request(`${this.base}/actions/runs/${runId}/${suffix}`, {
      method: "POST",
    });
  }

  /** Plain-text logs for a single job, used to surface failing steps. */
  async jobLogs(jobId: number): Promise<string> {
    const response = await this.client.requestRaw(
      `${this.base}/actions/jobs/${jobId}/logs`,
    );
    if (!response.ok) return "";
    return response.text();
  }

  /**
   * Finds the run a push or dispatch just triggered. GitHub takes a few
   * seconds to register a run, so this polls rather than reading once.
   */
  async findTriggeredRun(options: {
    workflowFile: string;
    headSha?: string;
    branch?: string;
    event?: string;
    notBefore: number;
    timeoutMs?: number;
    intervalMs?: number;
    onWait?: (attempt: number) => void;
  }): Promise<WorkflowRun | null> {
    const timeout = options.timeoutMs ?? 60_000;
    const interval = options.intervalMs ?? 3000;
    const deadline = Date.now() + timeout;

    for (let attempt = 1; Date.now() < deadline; attempt++) {
      options.onWait?.(attempt);

      const runs = await this.listRuns({
        workflowFile: options.workflowFile,
        headSha: options.headSha,
        branch: options.headSha ? undefined : options.branch,
        event: options.event,
        limit: 10,
      });

      const match = runs
        .filter((run) => new Date(run.created_at).getTime() >= options.notBefore - 5000)
        .sort((a, b) => b.run_number - a.run_number)[0];

      if (match) return match;

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return null;
  }
}
