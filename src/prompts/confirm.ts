import { confirm, cancel, isCancel } from "@clack/prompts";

export async function confirmDeployment(): Promise<void> {
  const result = await confirm({
    message: "Proceed with deployment?",
  });

  if (isCancel(result)) {
    cancel("Deployment cancelled.");
    process.exit(0);
  }

  if (!result) {
    cancel("Deployment cancelled.");
    process.exit(0);
  }
}
