import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { confirm, select, text } from "@clack/prompts";
import { CancelledError, DeployPilotError } from "../errors";
import { Context } from "../core/context";
import { TEMPLATES, findTemplate } from "../templates/workflows";
import { log } from "../ui/logger";
import { unwrap } from "../ui/prompt";
import type { GlobalFlags } from "../core/flags";

export interface NewFlags extends GlobalFlags {
  template?: string;
  output?: string;
}

export async function newCommand(flags: NewFlags): Promise<void> {
  const context = await Context.create(flags);

  const template = flags.template
    ? findTemplate(flags.template)
    : await pickTemplate(context.interactive);

  if (!template) {
    throw new DeployPilotError(`Unknown template '${flags.template}'.`, {
      hint: `Available:\n${TEMPLATES.map((entry) => `  ${entry.id.padEnd(14)} ${entry.label}`).join("\n")}`,
    });
  }

  const filename =
    flags.output ??
    (context.interactive
      ? unwrap(
          await text({
            message: "File name",
            defaultValue: template.filename,
            placeholder: template.filename,
          }),
        ) || template.filename
      : template.filename);

  const directory = path.join(context.root, ".github", "workflows");
  const target = path.join(directory, filename);

  if (existsSync(target)) {
    if (!context.interactive) {
      throw new DeployPilotError(`${filename} already exists.`, {
        hint: "Pass a different --output name.",
      });
    }
    const overwrite = unwrap(
      await confirm({
        message: `${filename} already exists. Overwrite it?`,
        initialValue: false,
      }),
    );
    if (!overwrite) throw new CancelledError();
  }

  if (context.dryRun) {
    log.dryRun(`write ${path.relative(context.root, target)}`);
    log.plain();
    log.plain(template.content);
    return;
  }

  await mkdir(directory, { recursive: true });
  await writeFile(target, template.content, "utf8");

  log.plain();
  log.success(`Created ${pc.bold(path.relative(context.root, target))}`);
  log.plain();
  log.info("Next steps:");
  log.plain(`  deploypilot explain ${filename}   ${pc.dim("# see when it runs")}`);
  log.plain(`  deploypilot doctor                ${pc.dim("# audit it")}`);
  log.plain(`  git add ${path.relative(context.root, target)} && git commit -m "ci: add ${filename}"`);
  log.plain();
}

async function pickTemplate(interactive: boolean) {
  if (!interactive) return TEMPLATES[0];

  return unwrap(
    await select({
      message: "Which workflow do you want?",
      options: TEMPLATES.map((template) => ({
        value: template,
        label: template.label,
        hint: template.hint,
      })),
    }),
  );
}
