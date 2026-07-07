export interface WorkflowInput {
  description?: string;
  required?: boolean;
  default?: string;
  type?: string;
  options?: string[];
}

export interface WorkflowDispatch {
  inputs?: Record<string, WorkflowInput>;
}

export interface WorkflowTriggerPush {
  branches?: string[];
  tags?: string[];
}

export interface WorkflowTrigger {
  push?: WorkflowTriggerPush;
  workflow_dispatch?: WorkflowDispatch | null;
}

export interface WorkflowRaw {
  name?: string;
  on: WorkflowTrigger;
  jobs?: Record<string, unknown>;
}

export interface Workflow {
  name: string;
  filename: string;
  path: string;
  on: WorkflowTrigger;
  raw: WorkflowRaw;
}
