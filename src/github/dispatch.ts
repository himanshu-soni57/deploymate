import { DeployPilotError } from "../errors";
import type { GitHubClient } from "./client";

export class DispatchApi {
  constructor(private readonly client: GitHubClient) {}

  private get base(): string {
    const { owner, repo } = this.client.repo;
    return `/repos/${owner}/${repo}`;
  }

  /**
   * Fires `workflow_dispatch`. GitHub only accepts string values here, so
   * booleans and numbers are stringified before sending.
   */
  async dispatchWorkflow(
    workflowFile: string,
    ref: string,
    inputs: Record<string, string | number | boolean> = {},
  ): Promise<void> {
    const normalized = Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [key, String(value)]),
    );

    try {
      await this.client.request(
        `${this.base}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
        { method: "POST", body: { ref, inputs: normalized } },
      );
    } catch (error) {
      if (error instanceof DeployPilotError && error.message.includes("404")) {
        throw new DeployPilotError(
          `GitHub could not dispatch '${workflowFile}'.`,
          {
            hint:
              "workflow_dispatch has two requirements that are easy to miss:\n" +
              "  1. the workflow file must exist on the repository's DEFAULT branch\n" +
              "  2. that copy must declare `on: workflow_dispatch:`\n" +
              `Also confirm the ref '${ref}' has been pushed.`,
            cause: error,
          },
        );
      }
      throw error;
    }
  }

  async repositoryDispatch(
    eventType: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.client.request(`${this.base}/dispatches`, {
      method: "POST",
      body: { event_type: eventType, client_payload: payload },
    });
  }
}
