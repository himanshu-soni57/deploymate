import { DeploymentService } from "../services/deployment";

export async function deploy() {
  await DeploymentService.run();
}
