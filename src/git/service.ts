import simpleGit from "simple-git";
import type { GitRepository, GitStatus } from "../types/git";

export class GitService {
  private git = simpleGit();

  async isRepository(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  async getRepository(): Promise<GitRepository> {
    const branch = await this.git.branch();
    const remotes = await this.git.getRemotes(true);

    return {
      branch: branch.current,
      remotes: remotes.map((remote) => remote.name),
    };
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();

    return {
      isRepo: await this.isRepository(),
      hasChanges: !status.isClean(),
      currentBranch: status.current,
    };
  }
  async hasChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  async getCurrentBranch(): Promise<string> {
    const branch = await this.git.branch();
    return branch.current;
  }

  async stageAll() {
    await this.git.add(".");
  }

  async commit(message: string) {
    await this.git.commit(message);
  }

  async createTag(tag: string) {
    await this.git.addTag(tag);
  }

  async pushBranch(remote = "origin") {
    await this.git.push(remote);
  }

  async pushTag(tag: string, remote = "origin") {
    await this.git.pushTags(remote, tag);
  }
}
