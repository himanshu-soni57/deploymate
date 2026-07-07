export interface GitRepository {
  branch: string;
  remotes: string[];
}

export interface GitStatus {
  isRepo: boolean;
  hasChanges: boolean;
  currentBranch: string;
}
