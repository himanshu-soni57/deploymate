# DeployPilot — Advancement Plan & Status

> Repo `deploymate` · npm package **`deploypilot`** · binaries `deploypilot`, `dpp`
> Version `0.2.0` · TypeScript + Bun + tsup + commander + @clack/prompts + simple-git + yaml
>
> **Status: phases 1–8 implemented.** 625 lines grew to 8,582 across 93 source files,
> plus 1,287 lines of tests (148 passing). Everything below marked ✅ is built and
> verified; ⏭ is deliberately deferred with the reason given.

---

## 1. Bugs found in 0.1.0 — all fixed

| # | Defect | Status |
| --- | --- | --- |
| 1.1 | `workflow_dispatch` only committed and pushed. A dispatch-only workflow has no push trigger, so **GitHub ran nothing** while the CLI printed "Deployment started successfully." | ✅ `src/executors/dispatch.ts` calls `POST /actions/workflows/{file}/dispatches`; the `WorkflowInput` type that was written but never read now drives `src/prompts/inputs.ts` |
| 1.2 | Identity split four ways: npm `deploypilot`, bins `deploypilot`/`dpp`, commander name `deploymate`, README told users `npm install -g deploymate` and `dpm deploy`. **Every documented command was wrong.** | ✅ `deploypilot` everywhere; `DeployMateError` → `DeployPilotError`; README rewritten |
| 1.3 | `.version("0.1.0")` hardcoded; `src/version.ts` unused and would break the build (`resolveJsonModule` was off) | ✅ `resolveJsonModule` on, `VERSION` wired into the CLI |
| 1.4 | `git push origin` with no refspec or `-u` — fails on any branch that has never been pushed | ✅ `pushBranch(branch, remote, setUpstream)`, upstream detected in preflight |
| 1.5 | No `git fetch`, no behind-remote check; push rejected *after* the commit was already made | ✅ preflight fetches and fails on `behind > 0` with a `git pull --rebase` hint |
| 1.6 | Tag generator took the prefix before `*` and appended a timestamp. `v*.*.*` produced `v20260908-141530` — **a tag that does not match the workflow's own filter, so it triggers nothing** | ✅ `src/versioning/` classifies the pattern (semver / calver / timestamp / literal), and every candidate is regex-validated against the pattern before it is offered |
| 1.7 | `GitStatus.currentBranch` typed `string` but null on detached HEAD | ✅ `string \| null` throughout; detached HEAD detected and reported |
| 1.8 | `git add .` staged everything blindly — the riskiest line in a push-to-prod tool | ✅ four staging modes plus credential detection (see §3) |
| 1.9 | Only `tags[0]` / `branches[0]` used, the rest silently discarded | ✅ all patterns carried; the user picks when there is more than one |
| 1.10 | No rollback: a failed branch push left a dangling local tag that blocked the next run | ✅ `src/core/transaction.ts` journals every mutation and unwinds in reverse |
| 1.11 | `console.clear()` wiped scrollback and polluted CI logs | ✅ removed |
| 1.12 | Lightweight tags only — no tagger, date, message, or signature | ✅ annotated by default, carrying a generated changelog; `--sign` for GPG |
| 1.13 | Four empty files, a duplicate type module, an unused root `index.ts`, and `execa` + `open` shipped to users unused | ✅ all deleted; dependency count 8 → 5 |
| 1.14 | Zero tests | ✅ 148 tests across 12 files |
| 1.15 | Prompt cancellation called `process.exit(0)` — success — from inside leaf prompts | ✅ `CancelledError` thrown and handled once; exit `130` |

**Two further bugs surfaced while writing the tests:**

- `on: push` in scalar form normalizes to `{ push: null }`; the truthiness check skipped
  it, so a bare-push workflow reported **no strategy at all**. Fixed in `planner.ts`.
- A duplicate shebang (source + tsup banner) made the built binary unparseable by Node.

---

## 2. Architecture

### 2.1 GitHub API client ✅

`src/github/` — hand-rolled `fetch` client rather than Octokit, to keep CLI startup fast.

`repo-url.ts` (SSH / HTTPS / `git@` / Enterprise, with `api.github.com` vs `/api/v3`),
`auth.ts` (`DEPLOYPILOT_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN` → `gh auth token`),
`client.ts` (pagination, dry-run, status-specific hints for 401/403/404/422),
`runs.ts`, `dispatch.ts`, `releases.ts`, `environments.ts`, `secrets.ts`.

### 2.2 Planner depth ✅

`buildPlan()` returns **all viable strategies, ranked**, plus `blockers` explaining why a
workflow cannot be triggered. `src/workflow/triggers.ts` evaluates `branches`,
`branches-ignore`, `tags`, `tags-ignore`, `paths` and `paths-ignore` — so DeployPilot can
now answer "will this push actually start the workflow?" and refuse when the answer is no.

### 2.3 Config and non-interactive mode ✅

`src/config/` loads `deploypilot.config.{ts,mts,js,mjs,json}`, `.deploypilotrc[.json]`, or
`package.json#deploypilot`. Every prompt has a flag equivalent; CI is auto-detected.

---

## 3. The staging feature

Four modes, offered as a prompt and available as flags:

| Mode | Flag | Behaviour |
| --- | --- | --- |
| Commit all changes | `-a, --all` | everything in the working tree |
| **Pick specific files** | `-f, --file <path...>` | multiselect checklist; globs accepted; unselected files stay uncommitted |
| Use the existing index | `--staged` | exactly what is already staged |
| **Deploy existing commits** | `--no-commit` | commit nothing; tag or dispatch work that is already committed, and possibly already pushed |

Details that matter:

- Selecting a subset while other files are staged **unstages the strays first**.
  Without that, `git commit` sweeps them into the production deploy.
- `--no-commit` can target any commit: `--ref <sha>`, or an interactive picker of the
  last 15 commits.
- When everything is already pushed, a branch push cannot re-trigger anything.
  DeployPilot says so and offers an empty commit or a dispatch, instead of reporting a
  success that never happened.
- Non-interactive runs with a dirty tree default to **existing commits only** — the tool
  never guesses that you meant to commit.
- Selected paths are matched against credential-shaped patterns (`.env*`, `*.pem`,
  `id_rsa`, `credentials.json`, …) and require confirmation.

---

## 4. Phase status

| Phase | Contents | Status |
| --- | --- | --- |
| 1 — Correctness and trust | preflight checklist, `--dry-run`, annotated + signed tags, transactional rollback, exit codes, test suite | ✅ |
| 2 — Live run monitoring | run discovery by head SHA, job graph, failing-step log extraction, approval-gate detection, `--watch` | ✅ |
| 3 — Inputs and dispatch | schema-driven input prompts, `--input k=v`, ref selection, `on: release` support | ✅ |
| 4 — Config and profiles | config file, environments, `preDeploy` gates, hooks, `dpp init` | ✅ |
| 5 — Versioning | semver / calver / timestamp, conventional-commit inference, changelog generation | ✅ |
| 6 — History and control | `status`, `history`, `logs`, `cancel`, `rerun --failed`, `rollback` | ✅ |
| 7 — Authoring and diagnostics | `doctor` (12 rules), `lint`, `explain`, `new` (6 templates), `secrets` | ✅ |
| 8 — Polish | shell completions, `--json` everywhere, CI detection, dependency trim | ✅ |

---

## 5. Deferred, with reasons

| Item | Why not now |
| --- | --- |
| ⏭ Full-screen live TUI | The current spinner + job graph covers the need; a real TUI wants a rendering library and would slow startup |
| ⏭ Local run cache in `~/.deploypilot` | `history` and `status` are fast enough against the API; a cache adds an invalidation problem for little gain |
| ⏭ Monorepo-aware tags (`pkg@1.2.3`) | Needs a workspace model; the versioning engine is already structured to accept it |
| ⏭ Device-flow login with OS keychain storage | `gh auth token` covers most developers with zero setup; keychain access needs a native dependency |
| ⏭ Full GitHub Actions JSON-schema validation | `lint` implements the structural rules that actually catch mistakes without a 2 MB schema download |
| ⏭ GitLab CI / CircleCI | Depth on GitHub is the product; revisit after 1.0 |

---

## 6. Open decisions

1. **Runtime** — resolved for now as **Node-compatible source, Bun for tests and
   development**. `CLAUDE.md` mandates Bun APIs (`Bun.$`, `Bun.Glob`, `Bun.file`), but
   the published binary declares `engines.node >= 20` and targets `node20`; using Bun
   APIs in `src/` would break the npm package for Node users. Tests use `bun test`, and
   `fast-glob`/`execa` were dropped in favour of `node:fs` and `node:child_process`
   rather than adding dependencies. Say the word if you want a Bun-only build instead.
2. **Public name** — settled on `deploypilot`, matching npm. `deploymate` remains the
   repo name; add it as a second `bin` alias if you own that name on npm.
3. **`main` entry** — `dist/config.js` exports `defineConfig` so config files can import
   it. The CLI itself stays `dist/index.js` under `bin`.

---

## 7. Layout

```
src/
  index.ts               commander wiring, 16 commands
  commands/              one file per command
  core/                  context, preflight, transaction, selection, hooks, flags
  git/service.ts         simple-git wrapper with a dry-run guard
  github/                REST client, auth, runs, dispatch, releases, environments, secrets
  workflow/              parser, discover, planner, triggers, lint, explain
  versioning/            semver, conventional commits, pattern analysis, suggestions
  audit/                 doctor rules
  config/                schema, defaults, loader
  executors/             tag, branch, dispatch, release, shared commit phase
  prompts/               workflow, strategy, files, commit, tag, ref, inputs, confirm
  watch/                 run watcher and renderer
  templates/             workflow scaffolds
  ui/  utils/  types/  errors/
tests/
  unit/         10 files
  integration/  git + selection + transaction against a real temp repo
```
