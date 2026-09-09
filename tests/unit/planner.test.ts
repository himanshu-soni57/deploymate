import { describe, expect, test } from "bun:test";
import { parseWorkflowSource } from "../../src/workflow/parser";
import { buildPlan } from "../../src/workflow/planner";
import type { Workflow } from "../../src/types/workflow";

function workflow(yaml: string, filename = "deploy.yml"): Workflow {
  const parsed = parseWorkflowSource(yaml, filename);
  return { ...parsed, filename, path: `/repo/.github/workflows/${filename}` };
}

const kinds = (yaml: string) =>
  buildPlan(workflow(yaml)).candidates.map((candidate) => candidate.strategy.kind);

describe("buildPlan", () => {
  test("detects a tag strategy", () => {
    expect(kinds(`on:\n  push:\n    tags: ["prod-v*"]\njobs: {}\n`)).toEqual(["tag"]);
  });

  test("detects a branch strategy", () => {
    expect(kinds(`on:\n  push:\n    branches: [main]\njobs: {}\n`)).toEqual(["branch"]);
  });

  test("returns every viable strategy, ranked", () => {
    const found = kinds(
      `on:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:\njobs: {}\n`,
    );
    expect(found).toEqual(["tag", "dispatch"]);
  });

  test("keeps both branch and tag when one push block declares each", () => {
    const found = kinds(
      `on:\n  push:\n    branches: [main]\n    tags: ["v*"]\njobs: {}\n`,
    );
    expect(found.sort()).toEqual(["branch", "tag"]);
  });

  test("carries every tag pattern, not just the first", () => {
    const plan = buildPlan(
      workflow(`on:\n  push:\n    tags: ["v*", "prod-*"]\njobs: {}\n`),
    );
    const strategy = plan.candidates[0]!.strategy;
    expect(strategy.kind === "tag" && strategy.patterns).toEqual(["v*", "prod-*"]);
  });

  test("bare push with no filters means any branch", () => {
    const plan = buildPlan(workflow(`on: push\njobs: {}\n`));
    const strategy = plan.candidates[0]!.strategy;
    expect(strategy.kind).toBe("branch");
    expect(strategy.kind === "branch" && strategy.branches).toEqual([]);
  });

  test("supports release triggers", () => {
    expect(kinds(`on:\n  release:\n    types: [published]\njobs: {}\n`)).toEqual([
      "release",
    ]);
  });

  test("exposes workflow_dispatch inputs on the strategy", () => {
    const plan = buildPlan(
      workflow(
        `on:\n  workflow_dispatch:\n    inputs:\n      env:\n        type: choice\n        options: [a, b]\njobs: {}\n`,
      ),
    );
    const strategy = plan.candidates[0]!.strategy;
    expect(strategy.kind === "dispatch" && Object.keys(strategy.inputs)).toEqual([
      "env",
    ]);
  });

  test("explains why a reusable workflow cannot be triggered", () => {
    const plan = buildPlan(workflow(`on:\n  workflow_call:\njobs: {}\n`));
    expect(plan.candidates).toHaveLength(0);
    expect(plan.blockers.join(" ")).toContain("reusable workflow");
  });

  test("explains a pull-request-only workflow", () => {
    const plan = buildPlan(workflow(`on:\n  pull_request:\njobs: {}\n`));
    expect(plan.candidates).toHaveLength(0);
    expect(plan.blockers.join(" ")).toContain("pull request");
  });

  test("explains a schedule-only workflow", () => {
    const plan = buildPlan(
      workflow(`on:\n  schedule:\n    - cron: "0 0 * * *"\njobs: {}\n`),
    );
    expect(plan.blockers.join(" ")).toContain("schedule-only");
  });

  test("reports a workflow with no triggers at all", () => {
    const plan = buildPlan(workflow(`name: X\njobs: {}\n`));
    expect(plan.blockers.join(" ")).toContain("no `on:` triggers");
  });
});
