import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { selectWorkflow } from "../prompts/workflow";
import { log } from "../utils/logger";
import { discoverWorkflows } from "../workflow/discover";
import { getDeploymentPlan } from "../workflow/planner";

export class DeploymentService {
  private static git = new GitService();

  static async run() {
    console.clear();

    console.log("🚀 DeployMate\n");

    if (!(await this.git.isRepository())) {
      log.error("Current directory is not a Git repository.");
      return;
    }

    const repo = await this.git.getRepository();

    log.success("Git repository detected");
    log.info(`Current branch: ${repo.branch}`);

    const workflows = await discoverWorkflows();

    if (!workflows.length) {
      log.warn("No GitHub workflows found.");
      return;
    }

    console.log();

    const workflow = await selectWorkflow(workflows);

    const plan = getDeploymentPlan(workflow);

    console.log();

    log.success(`Selected workflow: ${plan.workflowName}`);
    log.info(`Strategy: ${plan.strategy}`);

    switch (plan.strategy) {
      case "manual":
        await this.manualDeployment();
        break;

      case "tag":
        log.warn("Tag deployment not implemented yet.");
        break;

      case "branch":
        log.warn("Branch deployment not implemented yet.");
        break;

      default:
        log.error("Unknown deployment strategy.");
    }
  }

  private static async manualDeployment() {
    console.log();

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
