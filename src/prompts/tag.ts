import { cancel, confirm, isCancel } from "@clack/prompts";

export async function confirmTagOnlyDeployment(): Promise<boolean> {
  const result = await confirm({
    message:
      "No uncommitted changes found. Create a deployment tag from the latest commit?",
  });

  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  return result;
}
