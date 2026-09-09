import { describe, expect, test } from "bun:test";
import { lintWorkflowSource } from "../../src/workflow/lint";

const rules = (yaml: string) =>
  lintWorkflowSource(yaml, "test.yml").map((finding) => finding.rule);

describe("lintWorkflowSource", () => {
  test("accepts a valid workflow", () => {
    expect(
      rules(
        `name: CI\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`,
      ),
    ).toEqual([]);
  });

  test("reports invalid YAML with a line number", () => {
    const findings = lintWorkflowSource("name: [unclosed\njobs: {}\n", "bad.yml");
    expect(findings[0]?.rule).toBe("yaml-parse");
    expect(findings[0]?.line).toBeGreaterThan(0);
  });

  test("reports a missing on block", () => {
    expect(rules(`name: X\njobs:\n  a:\n    runs-on: ubuntu-latest\n`)).toContain(
      "missing-on",
    );
  });

  test("reports an unknown event", () => {
    const findings = lintWorkflowSource(
      `on:\n  pushh:\njobs:\n  a:\n    runs-on: ubuntu-latest\n`,
      "t.yml",
    );
    const unknown = findings.find((finding) => finding.rule === "unknown-event");
    expect(unknown?.message).toContain("pushh");
    expect(unknown?.fix).toContain("push");
  });

  test("reports a job with neither runs-on nor uses", () => {
    expect(rules(`on: push\njobs:\n  a:\n    steps:\n      - run: x\n`)).toContain(
      "missing-runs-on",
    );
  });

  test("reports a needs reference to a job that does not exist", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    needs: [ghost]\n    steps:\n      - run: x\n`,
      ),
    ).toContain("unknown-need");
  });

  test("reports a step with both uses and run", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        run: echo x\n`,
      ),
    ).toContain("invalid-step");
  });

  test("reports a step with neither uses nor run", () => {
    expect(
      rules(
        `on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - name: nothing\n`,
      ),
    ).toContain("invalid-step");
  });

  test("reports unknown top-level and job keys", () => {
    const found = rules(
      `on: push\nnope: 1\njobs:\n  a:\n    runs-on: ubuntu-latest\n    alsonope: 1\n    steps:\n      - run: x\n`,
    );
    expect(found).toContain("unknown-key");
    expect(found).toContain("unknown-job-key");
  });

  test("reports a missing jobs block", () => {
    expect(rules(`on: push\n`)).toContain("missing-jobs");
  });
});
