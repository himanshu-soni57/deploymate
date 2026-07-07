import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { log } from "../utils/logger";
import { generateTag } from "../utils/tag";

export class TagExecutor {
  constructor(private git: GitService) {}

  async execute(pattern: string) {
    if (!(await this.git.hasChanges())) {
      log.warn("Nothing to commit.");
      return;
    }

    const message = await askCommitMessage();

    const tag = generateTag(pattern);

    log.info("Staging files...");
    await this.git.stageAll();

    log.info("Creating commit...");
    await this.git.commit(message);

    log.info(`Creating tag: ${tag}`);
    await this.git.createTag(tag);

    log.info("Pushing branch...");
    await this.git.pushBranch();

    log.info("Pushing tag...");
    await this.git.pushTag(tag);

    console.log();

    log.success("Deployment started.");
    log.success(`Tag: ${tag}`);
  }
}
