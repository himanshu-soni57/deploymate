export interface Workflow {
  name: string;
  filename: string;
  path: string;
  on: unknown;
  raw: Record<string, unknown>;
}
