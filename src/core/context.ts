import { DeployPilotError } from "../errors";
import { GitService } from "../git/service";
import {
  DispatchApi,
  EnvironmentsApi,
  GitHubClient,
  ReleasesApi,
  RunsApi,
  SecretsApi,
  requireRepoRef,
  type RepoRef,
} from "../github";
import { loadConfig, mergeEnvironment } from "../config";
import type { DeployPilotConfig, EnvironmentConfig } from "../config";
import type { GitRepository } from "../types/git";
import { isInteractive } from "../utils/env";
import { log } from "../ui/logger";
import type { GlobalFlags } from "./flags";

export interface ContextOptions extends GlobalFlags {
  /** Commands that only read local files can skip the repository requirement. */
  requireRepo?: boolean;
}

export class Context {
  private repoRef: RepoRef | null = null;
  private client: GitHubClient | null = null;

  private constructor(
    readonly root: string,
    readonly git: GitService,
    readonly repository: GitRepository,
    readonly config: DeployPilotConfig,
    readonly configSource: string | null,
    readonly flags: GlobalFlags,
    readonly interactive: boolean,
  ) {}

  static async create(options: ContextOptions = {}): Promise<Context> {
    const cwd = options.cwd ?? process.cwd();
    const dryRun = options.dryRun === true;
    const git = new GitService({ cwd, dryRun });

    if (!(await git.isRepository())) {
      throw new DeployPilotError(
        "This directory is not inside a Git repository.",
        {
          hint: "Run `git init` first, or change into your project directory.",
        },
      );
    }

    const repository = await git.getRepository();
    const { config, source } = await loadConfig(repository.root, options.config);

    if (options.verbose) log.level = "verbose";
    if (options.quiet) log.level = "silent";
    if (options.json) log.json = true;

    const interactive = isInteractive() && !options.json && !options.yes;

    return new Context(
      repository.root,
      git,
      repository,
      config,
      source,
      options,
      interactive,
    );
  }

  get dryRun(): boolean {
    return this.flags.dryRun === true;
  }

  get remote(): string {
    return this.flags.remote ?? this.config.remote ?? "origin";
  }

  environment(name?: string): EnvironmentConfig {
    const resolved = name ?? this.config.defaultEnvironment;

    if (name && !this.config.environments?.[name]) {
      const known = Object.keys(this.config.environments ?? {});
      throw new DeployPilotError(`Unknown environment '${name}'.`, {
        hint: known.length
          ? `Defined environments: ${known.join(", ")}`
          : "No environments are defined. Create some with `deploypilot init`.",
      });
    }

    return mergeEnvironment(this.config, resolved);
  }

  async repoRefOrThrow(): Promise<RepoRef> {
    if (this.repoRef) return this.repoRef;
    const url = await this.git.getRemoteUrl(this.remote);
    this.repoRef = requireRepoRef(url);
    return this.repoRef;
  }

  async github(): Promise<GitHubClient> {
    if (this.client) return this.client;
    this.client = new GitHubClient(await this.repoRefOrThrow(), this.dryRun);
    return this.client;
  }

  async runs(): Promise<RunsApi> {
    return new RunsApi(await this.github());
  }

  async dispatch(): Promise<DispatchApi> {
    return new DispatchApi(await this.github());
  }

  async releases(): Promise<ReleasesApi> {
    return new ReleasesApi(await this.github());
  }

  async environments(): Promise<EnvironmentsApi> {
    return new EnvironmentsApi(await this.github());
  }

  async secrets(): Promise<SecretsApi> {
    return new SecretsApi(await this.github());
  }

  /** Refuses to continue when a confirmation cannot be shown. */
  requireInteractive(what: string): void {
    if (this.interactive) return;
    throw new DeployPilotError(`${what} requires an interactive terminal.`, {
      hint: "Pass the value explicitly as a flag, or re-run with --yes to accept defaults.",
    });
  }
}
