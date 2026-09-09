import pc from "picocolors";
import { Context } from "../core/context";
import { discoverWorkflows } from "../workflow/discover";
import { log } from "../ui/logger";
import { renderTable } from "../ui/table";
import type { GlobalFlags } from "../core/flags";

const SECRET_REF = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;
const VARIABLE_REF = /vars\.([A-Za-z_][A-Za-z0-9_]*)/g;

interface Row {
  name: string;
  kind: "secret" | "variable";
  configured: boolean;
  usedBy: string[];
}

/**
 * Cross-references what the workflows ask for against what the repository
 * actually defines. Names only; values are never read.
 */
export async function secretsCommand(flags: GlobalFlags): Promise<void> {
  const context = await Context.create(flags);
  const workflows = await discoverWorkflows({ root: context.root, tolerant: true });
  const api = await context.secrets();

  const [configuredSecrets, configuredVariables] = await Promise.all([
    api.listSecretNames(),
    api.listVariableNames(),
  ]);

  const used = new Map<string, Row>();

  const record = (name: string, kind: Row["kind"], file: string) => {
    const key = `${kind}:${name}`;
    const existing = used.get(key);
    if (existing) {
      if (!existing.usedBy.includes(file)) existing.usedBy.push(file);
      return;
    }
    used.set(key, {
      name,
      kind,
      configured:
        kind === "secret"
          ? configuredSecrets.includes(name)
          : configuredVariables.includes(name),
      usedBy: [file],
    });
  };

  for (const workflow of workflows) {
    for (const match of workflow.source.matchAll(SECRET_REF)) {
      if (match[1] === "GITHUB_TOKEN") continue;
      record(match[1]!, "secret", workflow.filename);
    }
    for (const match of workflow.source.matchAll(VARIABLE_REF)) {
      record(match[1]!, "variable", workflow.filename);
    }
  }

  const rows = [...used.values()].sort(
    (a, b) => Number(a.configured) - Number(b.configured) || a.name.localeCompare(b.name),
  );

  const unusedSecrets = configuredSecrets.filter(
    (name) => !used.has(`secret:${name}`),
  );

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ referenced: rows, unusedSecrets }, null, 2)}\n`,
    );
    return;
  }

  log.heading("Referenced by workflows");
  log.plain(
    renderTable(rows, [
      { header: "NAME", value: (row) => row.name },
      { header: "KIND", value: (row) => pc.dim(row.kind) },
      {
        header: "STATUS",
        value: (row) =>
          row.configured ? pc.green("configured") : pc.red("MISSING"),
      },
      { header: "USED BY", value: (row) => pc.dim(row.usedBy.join(", ")) },
    ]),
  );

  if (unusedSecrets.length) {
    log.heading("Configured but unused");
    for (const name of unusedSecrets) log.plain(`  ${pc.dim(name)}`);
  }

  const missing = rows.filter((row) => !row.configured);
  if (missing.length) {
    log.plain();
    log.error(
      `${missing.length} referenced secret(s)/variable(s) are not configured. Workflows using them will fail at runtime.`,
    );
    log.plain(
      missing
        .map((row) =>
          row.kind === "secret"
            ? `  gh secret set ${row.name}`
            : `  gh variable set ${row.name}`,
        )
        .join("\n"),
    );
    process.exitCode = 1;
  }
  log.plain();
}
