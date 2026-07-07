import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { log } from "../utils/logger";
import { createSpinner } from "../utils/spinner";

export class ManualExecutor {
  constructor(private readonly git: GitService) {}

  async execute(): Promise<void> {
    if (!(await this.git.hasChanges())) {
      log.warn("Nothing to commit.");
      return;
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
