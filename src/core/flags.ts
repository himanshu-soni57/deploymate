export interface GlobalFlags {
  cwd?: string;
  config?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  remote?: string;
}

export interface DeployFlags extends GlobalFlags {
  environment?: string;
  workflow?: string;
  strategy?: "tag" | "branch" | "dispatch" | "release";
  message?: string;
  /** Staging mode selectors. Mutually exclusive; validated in the command. */
  all?: boolean;
  file?: string[];
  staged?: boolean;
  noCommit?: boolean;
  /** Tag options. */
  tag?: string;
  ref?: string;
  bump?: "major" | "minor" | "patch" | "prerelease" | "auto";
  sign?: boolean;
  release?: boolean;
  /** workflow_dispatch inputs, as key=value pairs. */
  input?: string[];
  /** Behaviour toggles. */
  fetch?: boolean;
  push?: boolean;
  watch?: boolean;
  force?: boolean;
  emptyCommit?: boolean;
  signoff?: boolean;
  repositoryDispatch?: string;
}
