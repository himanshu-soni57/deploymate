import pc from "picocolors";
import { Context } from "../core/context";
import { log } from "../ui/logger";
import { renderTable } from "../ui/table";
import { relativeTime, truncate } from "../utils/format";
import { statusIcon } from "../watch/render";
import type { GlobalFlags } from "../core/flags";

export interface StatusFlags extends GlobalFlags {
  limit?: number;
}

/** Answers: what is deployed where, and what is in flight right now. */
export async function statusCommand(flags: StatusFlags): Promise<void> {
  const context = await Context.create(flags);
  const runs = await context.runs();
  const environments = await context.environments();

  const [inFlight, recent, envList] = await Promise.all([
    runs.listRuns({ status: "in_progress", limit: 10 }),
    runs.listRuns({ limit: flags.limit ?? 10 }),
    environments.list().catch(() => []),
  ]);

  const queued = await runs.listRuns({ status: "queued", limit: 10 }).catch(() => []);
  const waiting = await runs.listRuns({ status: "waiting", limit: 10 }).catch(() => []);
  const active = [...inFlight, ...queued, ...waiting];

  const environmentRows = [] as {
    name: string;
    ref: string;
    sha: string;
    when: string;
    state: string;
  }[];

  for (const environment of envList) {
    const deployments = await environments
      .listDeployments(environment.name, 1)
      .catch(() => []);
    const deployment = deployments[0];

    if (!deployment) {
      environmentRows.push({
        name: environment.name,
        ref: pc.dim("never deployed"),
        sha: "",
        when: "",
        state: "",
      });
      continue;
    }

    const state = await environments.latestStatus(deployment.id).catch(() => null);

    environmentRows.push({
      name: environment.name,
      ref: deployment.ref,
      sha: deployment.sha.slice(0, 8),
      when: relativeTime(deployment.created_at),
      state: state?.state ?? "unknown",
    });
  }

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ active, environments: environmentRows, recent }, null, 2)}\n`,
    );
    return;
  }

  const { owner, repo } = await context.repoRefOrThrow();
  log.heading(`${owner}/${repo}`);
  log.plain(
    `  branch ${pc.cyan(context.repository.branch ?? "detached")}  ${pc.dim(context.repository.headSha.slice(0, 8))}`,
  );

  log.heading("In flight");
  log.plain(
    renderTable(active, [
      { header: "RUN", value: (run) => `#${run.run_number}` },
      { header: "WORKFLOW", value: (run) => truncate(run.name ?? "-", 28) },
      { header: "STATUS", value: (run) => statusIcon(run.status, run.conclusion).trim() },
      { header: "REF", value: (run) => run.head_branch ?? run.head_sha.slice(0, 8) },
      { header: "STARTED", value: (run) => relativeTime(run.created_at) },
    ]),
  );

  if (environmentRows.length) {
    log.heading("Environments");
    log.plain(
      renderTable(environmentRows, [
        { header: "ENVIRONMENT", value: (row) => pc.magenta(row.name) },
        { header: "REF", value: (row) => row.ref },
        { header: "COMMIT", value: (row) => pc.dim(row.sha) },
        { header: "STATE", value: (row) => row.state },
        { header: "WHEN", value: (row) => pc.dim(row.when) },
      ]),
    );
  }

  log.heading("Recent runs");
  log.plain(
    renderTable(recent, [
      { header: "RUN", value: (run) => `#${run.run_number}` },
      { header: "WORKFLOW", value: (run) => truncate(run.name ?? "-", 28) },
      { header: "RESULT", value: (run) => statusIcon(run.status, run.conclusion).trim() },
      { header: "EVENT", value: (run) => run.event },
      { header: "WHEN", value: (run) => pc.dim(relativeTime(run.created_at)) },
    ]),
  );
  log.plain();
}
