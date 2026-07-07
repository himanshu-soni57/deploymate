export interface Workflow {
  name: string;
  filename: string;
  path: string;
  on: Record<string, unknown>;
  raw: Record<string, unknown>;
}
