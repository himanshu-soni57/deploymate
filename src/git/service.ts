import simpleGit, { type SimpleGit } from "simple-git";
import type { GitRepository, GitStatus } from "../types/git";

export class GitService {
  private readonly git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async isRepository(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  async getRepository(): Promise<GitRepository> {
    const [branch, remotes] = await Promise.all([
      this.git.branch(),
      this.git.getRemotes(true),
    ]);

    return {
      branch: branch.current,
      remotes: remotes.map((remote) => remote.name),
    };
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();

    return {
      isRepo: true,
      hasChanges: !status.isClean(),
      currentBranch: status.current,
    };
  }

  async hasChanges(): Promise<boolean> {
    return (await this.getStatus()).hasChanges;
  }

  async getCurrentBranch(): Promise<string> {
    return (await this.getStatus()).currentBranch;
  }

  async tagExists(tag: string): Promise<boolean> {
    const tags = await this.git.tags();
    return tags.all.includes(tag);
  }

  async stageAll(): Promise<void> {
    await this.git.add(".");
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message);
  }

  async createTag(tag: string): Promise<void> {
    await this.git.addTag(tag);
  }

  async pushBranch(remote = "origin"): Promise<void> {
    await this.git.push(remote);
  }

  async pushTag(tag: string, remote = "origin"): Promise<void> {
    await this.git.pushTags(remote, tag);
  }
}
