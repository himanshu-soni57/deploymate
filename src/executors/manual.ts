import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { log } from "../utils/logger";

export class ManualExecutor {
  constructor(private git: GitService) {}

  async execute() {
    if (!(await this.git.hasChanges())) {
      log.warn("Nothing to commit.");
      return;
    }

    const message = await askCommitMessage();

    log.info("Staging files...");
    await this.git.stageAll();

    log.info("Creating commit...");
    await this.git.commit(message);

    log.info("Pushing branch...");
    await this.git.pushBranch();

    console.log();

    log.success("Deployment started successfully.");
  }
}
