import { DeploymentService } from "../services/deployment";
import type { DeployFlags } from "../core/flags";

export async function deployCommand(flags: DeployFlags): Promise<void> {
  await DeploymentService.run(flags);
}
