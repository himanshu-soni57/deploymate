/** True when stdin/stdout can drive interactive prompts. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !isCI();
}

export function isCI(): boolean {
  const env = process.env;
  return Boolean(
    env.CI ||
      env.CONTINUOUS_INTEGRATION ||
      env.GITHUB_ACTIONS ||
      env.GITLAB_CI ||
      env.BUILDKITE ||
      env.CIRCLECI ||
      env.TEAMCITY_VERSION,
  );
}
