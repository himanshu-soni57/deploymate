import { cancel, isCancel, text } from "@clack/prompts";

export async function askCommitMessage(): Promise<string> {
  const result = await text({
    message: "Commit message",
    placeholder: "Fixed payment history",
    validate(value) {
      if (!value.trim()) {
        return "Commit message is required.";
      }
    },
  });

  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  return result.trim();
}
