import { describe, expect, test } from "bun:test";
import {
  normalizeTriggers,
  parseWorkflowSource,
} from "../../src/workflow/parser";

describe("normalizeTriggers", () => {
  test("accepts the scalar form", () => {
    expect(normalizeTriggers("push")).toEqual({ push: null });
  });

  test("accepts the sequence form", () => {
    expect(normalizeTriggers(["push", "workflow_dispatch"])).toEqual({
      push: null,
      workflow_dispatch: null,
    });
  });

  test("normalizes scalar branch and tag filters into arrays", () => {
    const trigger = normalizeTriggers({ push: { branches: "main", tags: "v1" } });
    expect(trigger.push?.branches).toEqual(["main"]);
    expect(trigger.push?.tags).toEqual(["v1"]);
  });

  test("keeps the ignore and path filters", () => {
    const trigger = normalizeTriggers({
      push: {
        branches: ["main"],
        "branches-ignore": ["wip/**"],
        paths: ["src/**"],
        "paths-ignore": ["docs/**"],
      },
    });
    expect(trigger.push?.["branches-ignore"]).toEqual(["wip/**"]);
    expect(trigger.push?.paths).toEqual(["src/**"]);
    expect(trigger.push?.["paths-ignore"]).toEqual(["docs/**"]);
  });

  test("handles an empty push block", () => {
    expect(normalizeTriggers({ push: null }).push).toBeNull();
    expect(normalizeTriggers({ push: {} }).push).toEqual({});
  });
});

describe("parseWorkflowSource", () => {
  test("parses a normal workflow", () => {
    const workflow = parseWorkflowSource(
      `name: Deploy\non:\n  push:\n    tags: ["prod-v*"]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`,
      "deploy.yml",
    );
    expect(workflow.name).toBe("Deploy");
    expect(workflow.on.push?.tags).toEqual(["prod-v*"]);
    expect(Object.keys(workflow.jobs)).toEqual(["build"]);
  });

  test("falls back to the filename when name is absent", () => {
    const workflow = parseWorkflowSource(`on: push\njobs: {}\n`, "ci.yml");
    expect(workflow.name).toBe("ci");
  });

  test("recovers triggers parsed as the boolean true (YAML 1.1)", () => {
    const workflow = parseWorkflowSource(
      `%YAML 1.1\n---\nname: Legacy\non:\n  push:\n    branches: [main]\njobs: {}\n`,
      "legacy.yml",
    );
    expect(workflow.on.push?.branches).toEqual(["main"]);
  });

  test("throws a helpful error on invalid YAML", () => {
    expect(() => parseWorkflowSource("name: [unclosed\n", "bad.yml")).toThrow(
      /bad\.yml/,
    );
  });

  test("keeps the raw source for line-accurate diagnostics", () => {
    const source = `name: X\non: push\njobs: {}\n`;
    expect(parseWorkflowSource(source, "x.yml").source).toBe(source);
  });
});
