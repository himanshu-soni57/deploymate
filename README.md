# DeployPilot

[![npm](https://img.shields.io/npm/v/deploypilot)](https://www.npmjs.com/package/deploypilot)
[![License](https://img.shields.io/npm/l/deploypilot)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)
[![Docs](https://img.shields.io/badge/docs-command%20deck-F0B429)](https://himanshu-soni57.github.io/deploymate/)

> Trigger, monitor, and audit GitHub Actions deployments from your terminal.

DeployPilot reads your `.github/workflows`, works out how each one can actually be
triggered, does the Git or API work to start it, then **watches the run and tells you
whether it worked**.

```bash
npm install -g deploypilot
```

The package is published as **`deploypilot`**. It installs two binaries: `deploypilot`
and the short alias `dpp`.

**[Command Deck &rarr; every command, flag, and rule in one searchable page](https://himanshu-soni57.github.io/deploymate/)**

---

## Quick start

```bash
dpp deploy          # pick a workflow, pick what to ship, go
dpp deploy --watch  # ...and follow the run to completion
dpp status          # what is deployed where, what is in flight
dpp doctor          # audit your workflows before they bite you
```

---

## Choosing what actually gets deployed

Not every deployment starts with "commit everything". DeployPilot asks:

```
? What should this deployment include?
  Commit all changes                        3 files
> Pick specific files to commit             choose from the list
  Commit only what is already staged        1 file
  Deploy existing commits only              leave the working tree untouched
```

**Pick specific files** opens a checklist. Anything you do not select stays in your
working tree, uncommitted:

```
? Select files to commit (space to toggle, enter to confirm)
> [x] src/payments.ts       modified
  [x] src/refunds.ts        modified
  [ ] notes.md              untracked
  [ ] .env.local            untracked
```

**Deploy existing commits only** is a first-class flow, not a fallback. Use it when the
code is already committed — even already pushed — and you just want to tag it and ship:

```bash
dpp deploy --no-commit          # tag HEAD, push the tag, done
dpp deploy --no-commit --ref a1b2c3d   # tag an older commit
```

If nothing is left to push, DeployPilot says so instead of reporting a success that
never happened:

```
! origin/main already has every local commit. A branch push would be a no-op
  and would not start a workflow run.
? Create an empty commit to re-trigger the workflow? (y/N)
```

All of it works non-interactively too:

| Flag | Effect |
| --- | --- |
| `-a, --all` | commit every change |
| `-f, --file <path...>` | commit only these files (repeatable, globs allowed) |
| `--staged` | commit exactly what is already in the index |
| `--no-commit` | commit nothing; deploy the commits that already exist |

```bash
dpp deploy -f 'src/**' -f package.json -m "fix: correct refund rounding"
```

If you select a subset while other files are already staged, the strays are unstaged
first — otherwise `git commit` would sweep them into your production deploy.

---

## Safety

Nothing is mutated until preflight passes:

```
Preflight
  ok    Git repository (/Users/you/project)
  ok    Remote 'origin' (git@github.com:you/project.git)
  ok    Current branch (main)
  ok    Fetched remote refs
  fail  Branch is 3 commits behind origin/main
```

- **`--dry-run`** prints every git command and API call, and performs none of them.
- **Credential detection** — `.env`, `*.pem`, `id_rsa`, `credentials.json` and friends
  are flagged before they are committed.
- **Rollback** — if a deployment fails partway, local changes are unwound. No more
  dangling tags blocking the next attempt.
- **Trigger verification** — DeployPilot refuses to create a tag that the workflow's own
  filter would ignore, and warns when a push cannot match a `paths:` filter.
- **`confirmWith: "type-name"`** makes you retype the environment name before prod.

---

## Versioning

Tag names are generated from the workflow's own pattern and validated against it.

| Workflow pattern | What you get |
| --- | --- |
| `v*.*.*` | `v1.2.4` / `v1.3.0` / `v2.0.0` / `v1.2.4-rc.0` |
| `prod-v*` with semver history | next semver, e.g. `prod-v1.2.4` |
| `prod-v*` with no semver history | `prod-v20260908-141530` |
| `release/*` | timestamp or calver, whichever matches |
| `v*-rc` | prefix and suffix are both preserved |

With Conventional Commits enabled, the bump is inferred from the commits since the last
tag — `BREAKING CHANGE` → major, `feat` → minor, everything else → patch — and marked
`(recommended)` in the picker. The annotated tag carries a generated changelog.

```bash
dpp deploy --bump minor
dpp deploy --bump auto      # infer from commit history
dpp deploy --tag prod-v2.0.0
```

---

## Watching the run

```
$ dpp deploy --watch

i Watching run #482: https://github.com/you/project/actions/runs/1234567890

  passed    build          1m 12s
  failed    deploy         46s
      failed      Run database migrations

x Run #482 failure after 2m 3s

Failure in 'deploy' at step 'Run database migrations'
  Error: relation "users" already exists
  at migrate (./scripts/migrate.ts:44)
```

Only the failing step's log tail is printed, not the whole log dump. If the run is
blocked on an environment reviewer, DeployPilot says that rather than appearing hung.

---

## Supported triggers

| Workflow `on:` | Strategy | What DeployPilot does |
| --- | --- | --- |
| `push.tags` | tag | commit, push branch, create + push an annotated tag |
| `push.branches` | branch | commit and push, honouring `paths:` filters |
| `workflow_dispatch` | dispatch | calls the GitHub API with prompted inputs |
| `release` | release | publishes a GitHub Release with a changelog |
| `repository_dispatch` | — | reported with the command to trigger it |
| `workflow_call` / `schedule` / `pull_request` | — | reported as not directly triggerable, with the reason |

A workflow with several triggers offers all of them:

```
? This workflow supports several triggers. Which one?
> Tag push          prod-v*
  Manual dispatch   2 inputs
```

`workflow_dispatch` inputs are prompted from the workflow's own schema — `choice`
becomes a select, `boolean` a confirm, `environment` a list of your real environments.

---

## Commands

Full reference, with every flag: **[Command Deck](https://himanshu-soni57.github.io/deploymate/)**.

| Command | Purpose |
| --- | --- |
| `dpp deploy [env]` | commit, push or dispatch, and start a run |
| `dpp watch [run-id]` | follow a run, surface failing steps |
| `dpp status` | in-flight runs, environment state, recent history |
| `dpp history` | past deployments with duration and outcome |
| `dpp logs [run-id]` | logs for a run, failing steps first |
| `dpp cancel [run-id]` | cancel the in-flight run |
| `dpp rerun [run-id] --failed` | re-run only the jobs that failed |
| `dpp rollback` | re-deploy a previous successful run |
| `dpp doctor` | audit workflows for security, correctness, cost |
| `dpp lint` | validate workflow YAML with line numbers |
| `dpp explain [workflow]` | plain-English description of when it runs |
| `dpp list` | discovered workflows and how they can be triggered |
| `dpp new` | scaffold a workflow from a template |
| `dpp secrets` | referenced secrets vs. configured ones |
| `dpp init` | generate a config from your existing workflows |
| `dpp completion <shell>` | bash / zsh / fish completions |

---

## `dpp doctor`

```
.github/workflows/deploy-prod.yml
  error :14   Secret 'DEPLOY_TOKEN' is referenced but not configured. [missing-secret]
              gh secret set DEPLOY_TOKEN
  warn  :7    'some-org/action@v1' is pinned to a mutable ref. [unpinned-action]
              Pin it to a commit SHA:
                uses: some-org/action@<40-char-sha>  # v1
  warn        No `concurrency:` group. Two deployments will race. [missing-concurrency]
```

Rules cover: workflows nothing can trigger, `pull_request_target` checking out untrusted
code, hardcoded credentials, removed workflow commands (`set-output`, `save-state`),
secrets referenced but never configured, unpinned and deprecated actions, missing
`permissions:` and `concurrency:`, retired runner images, and missing job timeouts.

---

## Configuration

Optional. Without it, everything is prompted.

```ts
// deploypilot.config.ts
import { defineConfig } from "deploypilot";

export default defineConfig({
  defaultEnvironment: "staging",
  environments: {
    staging: {
      workflow: "deploy-staging.yml",
      requireBranch: "develop",
      watch: true,
    },
    production: {
      workflow: "deploy-prod.yml",
      strategy: "tag",
      tagPattern: "prod-v*",
      versioning: "semver",
      requireBranch: "main",
      requireClean: true,
      confirmWith: "type-name",
      preDeploy: ["bun test", "bun run build"],
      createRelease: true,
      watch: true,
    },
  },
  commit: { convention: "conventional", signoff: true },
  hooks: { onFailure: "./scripts/alert.ts" },
});
```

Then:

```bash
dpp deploy production   # no prompts, gates enforced
```

`preDeploy` commands run locally before anything is pushed; a non-zero exit aborts the
deployment.

> TypeScript config files require the Bun runtime. Under Node.js use
> `deploypilot.config.mjs`, `deploypilot.config.json`, or a `deploypilot` key in
> `package.json`. Generate one with `dpp init`.

---

## Authentication

Needed for dispatch, watching, status, history, logs, rollback, and secret checks.
Tag and branch deployments work with plain Git and no token.

Resolution order:

1. `DEPLOYPILOT_TOKEN`
2. `GH_TOKEN`
3. `GITHUB_TOKEN`
4. `gh auth token` — if you already use the GitHub CLI, there is nothing to set up

The token needs the `repo` and `workflow` scopes. GitHub Enterprise Server is detected
from the remote URL.

---

## CI usage

DeployPilot detects CI and disables every prompt. Exit codes: `0` success, `1` failure,
`130` cancelled.

```bash
dpp deploy production --all -m "$COMMIT_MSG" --bump auto --watch --yes --json
```

With a dirty tree and no staging flag, a non-interactive run deploys **existing commits
only** — it never guesses that you meant to commit.

---

## Requirements

- Node.js 20+ (Bun works too, and is required for `.ts` config files)
- Git
- A GitHub repository with workflows

---

## Development

```bash
bun install
bun run dev        # run the CLI from source
bun test           # 148 tests
bun run typecheck
bun run build
```

---

## Roadmap

Shipped in 0.2.0: preflight and rollback, selective staging, deploy-existing-commits,
real `workflow_dispatch`, run monitoring, semver and changelogs, config profiles,
history/status/logs/cancel/rerun/rollback, doctor/lint/explain/new/secrets, completions.

Next:

- richer live TUI with per-step progress
- monorepo-aware tags (`pkg@1.2.3`)
- `dpp deploy --pr` to open a deployment pull request
- GitLab CI support (unlikely before 1.0; depth on GitHub is the priority)

---

## Contributing

Pull requests welcome. Please open an issue first for anything substantial.

## License

MIT (c) Himanshu Soni
