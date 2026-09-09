export interface GitRemote {
  name: string;
  fetch?: string;
  push?: string;
}

export interface GitRepository {
  root: string;
  branch: string | null;
  detached: boolean;
  headSha: string;
  remotes: GitRemote[];
}

export type FileChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "typechange";

export interface FileChange {
  path: string;
  from?: string;
  index: string;
  worktree: string;
  kind: FileChangeKind;
  staged: boolean;
  unstaged: boolean;
}

export interface GitStatus {
  branch: string | null;
  detached: boolean;
  tracking: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  files: FileChange[];
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  author: string;
  date: string;
}
