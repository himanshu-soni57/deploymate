import { BranchExecutor } from "../executors/branch";
import { GitService } from "../git/service";
import { askCommitMessage } from "../prompts/commit";
import { TagExecutor } from "../executors/tag";
import { selectWorkflow } from "../prompts/workflow";
import { log } from "../utils/logger";
import { discoverWorkflows } from "../workflow/discover";
import { ManualExecutor } from "../executors/manual";
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
        await new ManualExecutor(this.git).execute();
        break;

      case "tag":
        await new TagExecutor(this.git).execute(plan.tagPattern!);
        break;

      case "branch":
        await new BranchExecutor(this.git).execute(plan.branch!);
        break;

      default:
        log.error("Unknown deployment strategy.");
    }
  }
}
