import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { createSpinner } from "../utils/spinner";
import { log } from "../utils/logger";

export class BranchExecutor {
  constructor(private readonly git: GitService) {}

  async execute(branch: string): Promise<void> {
    if (!(await this.git.hasChanges())) {
      log.warn("Nothing to commit.");
      return;
    }

    const currentBranch = await this.git.getCurrentBranch();

    if (currentBranch !== branch) {
      throw new Error(
        `Current branch is '${currentBranch}', but workflow expects '${branch}'.`,
      );
    }

    const message = await askCommitMessage();

    const spinner = createSpinner();

    spinner.start("Staging files...");
    await this.git.stageAll();
    spinner.stop("Files staged");

    spinner.start("Creating commit...");
    await this.git.commit(message);
    spinner.stop("Commit created");

    spinner.start("Pushing branch...");
    await this.git.pushBranch();
    spinner.stop("Branch pushed");

    console.log();

    log.success("Deployment started successfully.");
  }
}
