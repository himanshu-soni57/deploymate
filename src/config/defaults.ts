import type { DeployPilotConfig, EnvironmentConfig } from "./schema";

/**
 * Paths that look like credentials or build output. DeployPilot warns loudly
 * before committing any of these, because `git add -A` on a deploy tool is the
 * fastest way to publish a secret.
 */
export const DEFAULT_PROTECTED_PATHS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "**/id_rsa",
  "**/id_ed25519",
  "**/credentials.json",
  "**/service-account*.json",
  "**/*.keystore",
  "**/*.jks",
  ".npmrc",
  ".netrc",
];

export const DEFAULT_ENVIRONMENT: EnvironmentConfig = {
  requireClean: false,
  versioning: "prompt",
  confirmWith: "confirm",
  watch: false,
  remote: "origin",
};

export const DEFAULT_CONFIG: DeployPilotConfig = {
  environments: {},
  commit: { convention: "free", signoff: false },
  protectedPaths: DEFAULT_PROTECTED_PATHS,
  remote: "origin",
  watch: false,
};

export function mergeEnvironment(
  config: DeployPilotConfig,
  name?: string,
): EnvironmentConfig {
  const named = name ? config.environments?.[name] : undefined;

  return {
    ...DEFAULT_ENVIRONMENT,
    remote: config.remote ?? DEFAULT_ENVIRONMENT.remote,
    watch: config.watch ?? DEFAULT_ENVIRONMENT.watch,
    ...named,
  };
}
