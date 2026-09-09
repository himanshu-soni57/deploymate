export type VersioningMode = "semver" | "calver" | "timestamp" | "prompt";
export type ConfirmMode = "none" | "confirm" | "type-name";
export type CommitConvention = "free" | "conventional";

export interface EnvironmentConfig {
  /** Workflow filename, e.g. "deploy-prod.yml". */
  workflow?: string;
  /** Force a strategy instead of inferring one from the workflow. */
  strategy?: "tag" | "branch" | "dispatch" | "release";
  /** Branch that must be checked out before deploying. */
  requireBranch?: string;
  /** Tag pattern override, when the workflow's own filter is too loose. */
  tagPattern?: string;
  versioning?: VersioningMode;
  /** Refuse to deploy with a dirty working tree. */
  requireClean?: boolean;
  /** Commands run locally before anything is pushed. A failure aborts. */
  preDeploy?: string[];
  /** Commands run after a successful deployment. */
  postDeploy?: string[];
  /** Extra friction before mutating anything. */
  confirmWith?: ConfirmMode;
  /** Default inputs for workflow_dispatch. */
  inputs?: Record<string, string | number | boolean>;
  /** Watch the run to completion by default. */
  watch?: boolean;
  remote?: string;
  /** Create a GitHub Release alongside the tag. */
  createRelease?: boolean;
  signTags?: boolean;
}

export interface CommitConfig {
  convention?: CommitConvention;
  signoff?: boolean;
  /** Appended to every commit message DeployPilot creates. */
  template?: string;
}

export interface HooksConfig {
  onSuccess?: string;
  onFailure?: string;
}

export interface DeployPilotConfig {
  $schema?: string;
  defaultEnvironment?: string;
  environments?: Record<string, EnvironmentConfig>;
  commit?: CommitConfig;
  hooks?: HooksConfig;
  remote?: string;
  /** Files that should never be committed by DeployPilot. */
  protectedPaths?: string[];
  watch?: boolean;
}

/** Identity helper that gives editors full type-checking in config files. */
export function defineConfig(config: DeployPilotConfig): DeployPilotConfig {
  return config;
}
