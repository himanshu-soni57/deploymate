import { describe, expect, test } from "bun:test";
import { audit } from "../../src/audit/doctor";
import { parseWorkflowSource } from "../../src/workflow/parser";
import type { Workflow } from "../../src/types/workflow";

function workflow(yaml: string, filename = "deploy.yml"): Workflow {
  const parsed = parseWorkflowSource(yaml, filename);
  return { ...parsed, filename, path: `/repo/.github/workflows/${filename}` };
}

const rules = (yaml: string, filename?: string, options = {}) =>
  audit([workflow(yaml, filename)], options).map((finding) => finding.rule);

describe("audit", () => {
  test("flags an action pinned to a mutable tag", () => {
    const found = rules(
      `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some-org/risky-action@v1\n`,
    );
    expect(found).toContain("unpinned-action");
  });

  test("does not flag an action pinned to a SHA", () => {
    const found = rules(
      `on: push\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: some-org/action@${"a".repeat(40)}\n`,
      "ci.yml",
    );
    expect(found).not.toContain("unpinned-action");
  });

  test("flags deprecated action versions", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v2\n`,
      ),
    ).toContain("deprecated-action");
  });

  test("flags removed workflow commands", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "::set-output name=x::1"\n`,
      ),
    ).toContain("deprecated-command");
  });

  test("flags a missing permissions block", () => {
    expect(
      rules(`on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: x\n`),
    ).toContain("missing-permissions");
  });

  test("flags a deploy workflow with no concurrency group", () => {
    expect(
      rules(
        `name: Deploy Production\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: x\n`,
      ),
    ).toContain("missing-concurrency");
  });

  test("does not demand concurrency on a non-deploy workflow", () => {
    expect(
      rules(
        `name: Unit Tests\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: x\n`,
        "tests.yml",
      ),
    ).not.toContain("missing-concurrency");
  });

  test("flags pull_request_target that checks out the PR head", () => {
    const found = rules(
      `on:\n  pull_request_target:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n`,
    );
    expect(found).toContain("untrusted-checkout");
  });

  test("flags a hardcoded credential", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: deploy --key AKIAIOSFODNN7EXAMPLE\n`,
      ),
    ).toContain("hardcoded-secret");
  });

  test("flags a retired runner image", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-18.04\n    steps:\n      - run: x\n`,
      ),
    ).toContain("stale-runner");
  });

  test("flags a secret the repository does not define", () => {
    const found = rules(
      `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: deploy\n        env:\n          TOKEN: \${{ secrets.DEPLOY_TOKEN }}\n`,
      "deploy.yml",
      { knownSecrets: ["OTHER"] },
    );
    expect(found).toContain("missing-secret");
  });

  test("does not flag a secret that is configured", () => {
    const found = rules(
      `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: deploy\n        env:\n          TOKEN: \${{ secrets.DEPLOY_TOKEN }}\n`,
      "deploy.yml",
      { knownSecrets: ["DEPLOY_TOKEN"] },
    );
    expect(found).not.toContain("missing-secret");
  });

  test("skips API-dependent rules when no secret list is available", () => {
    const found = rules(
      `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo \${{ secrets.X }}\n`,
    );
    expect(found).not.toContain("missing-secret");
  });

  test("sorts errors before warnings", () => {
    const findings = audit([
      workflow(
        `name: Deploy\non:\n  pull_request_target:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n`,
      ),
    ]);
    expect(findings[0]?.severity).toBe("error");
  });
});
