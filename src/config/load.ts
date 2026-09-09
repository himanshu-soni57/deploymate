import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DeployPilotError } from "../errors";
import { log } from "../ui/logger";
import { DEFAULT_CONFIG, DEFAULT_PROTECTED_PATHS } from "./defaults";
import type { DeployPilotConfig } from "./schema";

const FILENAMES = [
  "deploypilot.config.ts",
  "deploypilot.config.mts",
  "deploypilot.config.js",
  "deploypilot.config.mjs",
  "deploypilot.config.json",
  ".deploypilotrc.json",
  ".deploypilotrc",
];

export interface LoadedConfig {
  config: DeployPilotConfig;
  /** Absolute path of the file the config came from, or null for defaults. */
  source: string | null;
}

const isBun = Boolean((process as { versions?: { bun?: string } }).versions?.bun);

async function loadModule(file: string): Promise<DeployPilotConfig> {
  const extension = path.extname(file);

  if ((extension === ".ts" || extension === ".mts") && !isBun) {
    throw new DeployPilotError(
      `Cannot load '${path.basename(file)}' under Node.js.`,
      {
        hint:
          "TypeScript config files require the Bun runtime. Either run DeployPilot\n" +
          "with `bunx deploypilot`, or rename the file to deploypilot.config.mjs\n" +
          "or deploypilot.config.json.",
      },
    );
  }

  const imported = (await import(pathToFileURL(file).href)) as {
    default?: DeployPilotConfig;
  } & DeployPilotConfig;

  return imported.default ?? imported;
}

async function loadJson(file: string): Promise<DeployPilotConfig> {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text) as DeployPilotConfig;
  } catch (error) {
    throw new DeployPilotError(`'${path.basename(file)}' is not valid JSON.`, {
      hint: error instanceof Error ? error.message : undefined,
      cause: error,
    });
  }
}

async function loadFromPackageJson(root: string): Promise<DeployPilotConfig | null> {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return null;

  try {
    const pkg = JSON.parse(await readFile(file, "utf8")) as {
      deploypilot?: DeployPilotConfig;
    };
    return pkg.deploypilot ?? null;
  } catch {
    return null;
  }
}

export async function loadConfig(
  root: string,
  explicitPath?: string,
): Promise<LoadedConfig> {
  const candidates = explicitPath
    ? [path.resolve(root, explicitPath)]
    : FILENAMES.map((name) => path.join(root, name));

  for (const file of candidates) {
    if (!existsSync(file)) continue;

    const extension = path.extname(file);
    const loaded =
      extension === ".json" || extension === ""
        ? await loadJson(file)
        : await loadModule(file);

    log.debug(`Loaded config from ${file}`);
    return { config: normalize(loaded), source: file };
  }

  if (explicitPath) {
    throw new DeployPilotError(`Config file not found: ${explicitPath}`);
  }

  const fromPackage = await loadFromPackageJson(root);
  if (fromPackage) {
    log.debug("Loaded config from package.json#deploypilot");
    return { config: normalize(fromPackage), source: path.join(root, "package.json") };
  }

  return { config: normalize({}), source: null };
}

function normalize(config: DeployPilotConfig): DeployPilotConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    environments: config.environments ?? {},
    commit: { ...DEFAULT_CONFIG.commit, ...config.commit },
    protectedPaths: config.protectedPaths ?? DEFAULT_PROTECTED_PATHS,
  };
}

export function listEnvironments(config: DeployPilotConfig): string[] {
  return Object.keys(config.environments ?? {});
}
