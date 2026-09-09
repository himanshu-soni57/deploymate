import { text } from "@clack/prompts";
import { DeployPilotError } from "../errors";
import { unwrap } from "../ui/prompt";
import type { CommitConvention } from "../config";

const CONVENTIONAL =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s.+/;

export function validateCommitMessage(
  value: string,
  convention: CommitConvention | undefined,
): string | undefined {
  if (!value.trim()) return "Commit message is required.";

  if (convention === "conventional" && !CONVENTIONAL.test(value.trim())) {
    return "Use a conventional commit, e.g. `fix(payments): correct refund rounding`.";
  }

  return undefined;
}

export async function askCommitMessage(
  options: {
    interactive: boolean;
    provided?: string;
    convention?: CommitConvention;
    template?: string;
  },
): Promise<string> {
  if (options.provided) {
    const problem = validateCommitMessage(options.provided, options.convention);
    if (problem) throw new DeployPilotError(`Invalid commit message: ${problem}`);
    return decorate(options.provided.trim(), options.template);
  }

  if (!options.interactive) {
    throw new DeployPilotError("A commit message is required.", {
      hint: 'Pass one with -m "your message", or use --no-commit to deploy existing commits.',
    });
  }

  const result = unwrap(
    await text({
      message: "Commit message",
      placeholder:
        options.convention === "conventional"
          ? "fix(payments): correct refund rounding"
          : "Fix payment history",
      validate: (value = "") => validateCommitMessage(value, options.convention),
    }),
  );

  return decorate(result.trim(), options.template);
}

function decorate(message: string, template?: string): string {
  if (!template) return message;
  return `${message}\n\n${template}`;
}
