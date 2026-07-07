import { GitService } from "./service";

const git = new GitService();

export async function getRepositoryInfo() {
  if (!(await git.isRepository())) {
    throw new Error("Current directory is not a Git repository.");
  }

  return git.getRepository();
}
