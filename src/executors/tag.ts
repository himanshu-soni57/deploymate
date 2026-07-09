import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { confirmTagOnlyDeployment } from "../prompts/tag";
import { createSpinner } from "../utils/spinner";
import { log } from "../utils/logger";
import { generateTag } from "../utils/tag";

export class TagExecutor {
  constructor(private readonly git: GitService) {}

  async execute(pattern: string): Promise<void> {
    const tag = generateTag(pattern);

    if (await this.git.tagExists(tag)) {
      throw new Error(`Tag '${tag}' already exists.`);
    }

    const spinner = createSpinner();

    if (await this.git.hasChanges()) {
      const message = await askCommitMessage();

      spinner.start("Staging files...");
      await this.git.stageAll();
      spinner.stop("Files staged");

      spinner.start("Creating commit...");
      await this.git.commit(message);
      spinner.stop("Commit created");

      spinner.start(`Creating tag (${tag})...`);
      await this.git.createTag(tag);
      spinner.stop("Tag created");

      spinner.start("Pushing branch...");
      await this.git.pushBranch();
      spinner.stop("Branch pushed");
    } else {
      const proceed = await confirmTagOnlyDeployment();

      if (!proceed) {
        log.warn("Deployment cancelled.");
        return;
      }

      spinner.start(`Creating tag (${tag})...`);
      await this.git.createTag(tag);
      spinner.stop("Tag created");
    }

    spinner.start("Pushing tag...");
    await this.git.pushTag(tag);
    spinner.stop("Tag pushed");

    console.log();

    log.success("Deployment started successfully.");
    log.success(`Tag: ${tag}`);
  }
}
